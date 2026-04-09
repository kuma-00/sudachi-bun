import { type Pointer } from "bun:ffi";

import { readMorphemeArray } from "./ffi.ts";
import {
  createNativeSudachiError,
  loadNativeLibrary,
  readMorphemeResultLayout,
  type MorphemeResultLayout,
  type NativeSudachiLibrary,
} from "./native.ts";
import { SudachiError, type Morpheme, type TokenizeMode, type TokenizerLoadOptions } from "./types.ts";

const MODE_TO_NATIVE: Record<TokenizeMode, number> = {
  A: 0,
  B: 1,
  C: 2,
};

interface MorphemeListState {
  tokenizer: Tokenizer;
  text: string;
  mode: TokenizeMode;
  kind: MorphemeListStateKind;
  signatures: readonly string[];
}

interface MorphemeState {
  listState: MorphemeListState;
  index: number;
}

type MorphemeListStateKind = "owned" | "split";

const MORPHEME_LIST_STATE = new WeakMap<readonly Morpheme[], MorphemeListState>();
const MORPHEME_STATE = new WeakMap<Morpheme, MorphemeState>();

function toPointer(value: number | bigint): Pointer {
  return Number(value) as Pointer;
}

interface NativeTokenizerSession {
  handle: Pointer;
  layout: MorphemeResultLayout;
  library: NativeSudachiLibrary;
}

function openNativeTokenizer(options: TokenizerLoadOptions): NativeTokenizerSession {
  const library = loadNativeLibrary(options);

  try {
    const layout = readMorphemeResultLayout(library);
    const handleOut = new BigUint64Array(1);
    const status = library.symbols.sudachi_create_tokenizer(
      options.configPath ?? null,
      options.resourceDir ?? null,
      options.dictPath,
      handleOut,
    );

    if (status !== 0) {
      throw createNativeSudachiError(library, status, "Failed to create the tokenizer.");
    }

    const handleValue = handleOut[0] ?? 0n;
    if (handleValue === 0n) {
      throw new SudachiError("Tokenizer handle was null after initialization.", {
        code: "INTERNAL",
        nativeStatus: 255,
      });
    }

    return {
      handle: toPointer(handleValue),
      layout,
      library,
    };
  } catch (error) {
    library.close();
    throw error;
  }
}

export class Tokenizer {
  static create(options: TokenizerLoadOptions): Tokenizer {
    return Tokenizer.load(options);
  }

  static load(options: TokenizerLoadOptions): Tokenizer {
    return new Tokenizer(openNativeTokenizer(options));
  }

  #library: NativeSudachiLibrary | null;
  #layout: MorphemeResultLayout | null;
  #handle: Pointer | null;

  private constructor(session: NativeTokenizerSession) {
    this.#library = session.library;
    this.#layout = session.layout;
    this.#handle = session.handle;
  }

  get closed(): boolean {
    return this.#library === null || this.#handle === null || this.#layout === null;
  }

  tokenize(text: string, mode: TokenizeMode = "C"): Morpheme[] {
    const { library, handle } = this.#getOpenSession();

    const resultOut = new BigUint64Array(1);
    const status = library.symbols.sudachi_tokenize(handle, text, MODE_TO_NATIVE[mode], resultOut);
    if (status !== 0) {
      throw createNativeSudachiError(library, status, "Tokenization failed.");
    }

    return this.#readAndAttachFromOut(resultOut, "Tokenizer returned a null result pointer.", text, mode, "owned");
  }

  split(morpheme: Morpheme, mode: TokenizeMode = "C"): Morpheme[] {
    const { library, handle } = this.#getOpenSession();
    const state = this.#getMorphemeState(morpheme);
    const index = this.#resolveSourceIndex(state, morpheme);

    const resultOut = new BigUint64Array(1);
    const status = library.symbols.sudachi_split_morpheme(
      handle,
      state.listState.text,
      MODE_TO_NATIVE[state.listState.mode],
      index,
      MODE_TO_NATIVE[mode],
      resultOut,
    );

    if (status !== 0) {
      throw createNativeSudachiError(library, status, "Morpheme split failed.");
    }

    return this.#readAndAttachFromOut(
      resultOut,
      "Tokenizer returned a null morpheme split pointer.",
      state.listState.text,
      mode,
      "split",
    );
  }

  splitInto(morphemes: readonly Morpheme[], mode: TokenizeMode = "C"): Morpheme[] {
    if (morphemes.length === 0) {
      return [];
    }

    const { library, handle } = this.#getOpenSession();
    const listState = MORPHEME_LIST_STATE.get(morphemes);

    if (listState !== undefined && this.#canUseWholeListSplit(morphemes, listState)) {
      if (listState.tokenizer !== this) {
        throw new SudachiError("Morpheme list was not created by this tokenizer.", {
          code: "INVALID_ARGUMENT",
        });
      }

      const resultOut = new BigUint64Array(1);
      const status = library.symbols.sudachi_split_morphemes(
        handle,
        listState.text,
        MODE_TO_NATIVE[listState.mode],
        MODE_TO_NATIVE[mode],
        resultOut,
      );

      if (status !== 0) {
        throw createNativeSudachiError(library, status, "Morpheme list split failed.");
      }

      return this.#readAndAttachFromOut(
        resultOut,
        "Tokenizer returned a null morpheme list split pointer.",
        listState.text,
        mode,
        "owned",
      );
    }

    const results: Morpheme[] = [];
    for (const morpheme of morphemes) {
      results.push(...this.split(morpheme, mode));
    }
    return results;
  }

  close(): void {
    if (this.#library === null) {
      return;
    }

    if (this.#handle !== null) {
      this.#library.symbols.sudachi_free_tokenizer(this.#handle);
    }

    this.#handle = null;
    this.#layout = null;
    this.#library.close();
    this.#library = null;
  }

  [Symbol.dispose](): void {
    this.close();
  }

  #getOpenSession(): { handle: Pointer; layout: MorphemeResultLayout; library: NativeSudachiLibrary } {
    const library = this.#library;
    const layout = this.#layout;
    const handle = this.#handle;
    if (library === null || layout === null || handle === null) {
      throw new SudachiError("Tokenizer has been closed.", {
        code: "TOKENIZER_CLOSED",
      });
    }

    return { library, layout, handle };
  }

  #readAndAttachFromOut(
    resultOut: BigUint64Array,
    nullMessage: string,
    text: string,
    mode: TokenizeMode,
    kind: MorphemeListStateKind,
  ): Morpheme[] {
    const { library } = this.#getOpenSession();
    const resultValue = resultOut[0] ?? 0n;
    if (resultValue === 0n) {
      throw new SudachiError(nullMessage, {
        code: "INTERNAL",
        nativeStatus: 255,
      });
    }

    const resultPtr = toPointer(resultValue);
    try {
      const morphemes = readMorphemeArray(resultPtr, this.#getOpenSession().layout);
      return this.#attachMorphemeState(morphemes, text, mode, kind);
    } finally {
      library.symbols.sudachi_free_result(resultPtr);
    }
  }

  #attachMorphemeState(morphemes: Morpheme[], text: string, mode: TokenizeMode, kind: MorphemeListStateKind): Morpheme[] {
    const signatures = morphemes.map((morpheme) => this.#morphemeSignature(morpheme));
    const listState: MorphemeListState = {
      tokenizer: this,
      text,
      mode,
      kind,
      signatures,
    };

    MORPHEME_LIST_STATE.set(morphemes, listState);

    for (const [index, morpheme] of morphemes.entries()) {
      MORPHEME_STATE.set(morpheme, {
        listState,
        index,
      });
    }

    return morphemes;
  }

  #getMorphemeState(morpheme: Morpheme): MorphemeState {
    const morphemeState = MORPHEME_STATE.get(morpheme);
    if (morphemeState === undefined || morphemeState.listState.tokenizer !== this) {
      throw new SudachiError("Morpheme was not created by this tokenizer.", {
        code: "INVALID_ARGUMENT",
      });
    }

    return morphemeState;
  }

  #canUseWholeListSplit(morphemes: readonly Morpheme[], listState: MorphemeListState): boolean {
    if (listState.kind !== "owned") {
      return false;
    }

    if (morphemes.length !== listState.signatures.length) {
      return false;
    }

    for (let index = 0; index < morphemes.length; index += 1) {
      if (this.#morphemeSignature(morphemes[index]!) !== listState.signatures[index]) {
        return false;
      }
    }

    return true;
  }

  #resolveSourceIndex(morphemeState: MorphemeState, morpheme: Morpheme): number {
    if (morphemeState.listState.kind === "owned") {
      return morphemeState.index;
    }

    return this.#resolveIndexByRetokenizing(morphemeState.listState.text, morphemeState.listState.mode, morpheme);
  }

  #resolveIndexByRetokenizing(text: string, mode: TokenizeMode, morpheme: Morpheme): number {
    const list = this.tokenize(text, mode);
    for (const [index, candidate] of list.entries()) {
      if (this.#morphemeMatches(candidate, morpheme)) {
        return index;
      }
    }

    throw new SudachiError("Failed to resolve the morpheme index from the source text.", {
      code: "INTERNAL",
      nativeStatus: 255,
    });
  }

  #morphemeMatches(left: Morpheme, right: Morpheme): boolean {
    return (
      left.begin === right.begin &&
      left.end === right.end &&
      left.surface === right.surface &&
      left.normalized === right.normalized &&
      left.dictionaryForm === right.dictionaryForm &&
      left.reading === right.reading &&
      left.pos === right.pos &&
      left.wordId === right.wordId &&
      left.posId === right.posId &&
      left.dictionaryId === right.dictionaryId &&
      left.isOov === right.isOov &&
      this.#sameSynonymGroupIds(left.synonymGroupIds, right.synonymGroupIds)
    );
  }

  #sameSynonymGroupIds(left: readonly number[], right: readonly number[]): boolean {
    if (left.length !== right.length) {
      return false;
    }

    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) {
        return false;
      }
    }

    return true;
  }

  #morphemeSignature(morpheme: Morpheme): string {
    return [
      morpheme.surface,
      morpheme.normalized,
      morpheme.dictionaryForm,
      morpheme.reading,
      morpheme.pos,
      morpheme.begin,
      morpheme.end,
      morpheme.wordId,
      morpheme.posId,
      morpheme.dictionaryId,
      morpheme.isOov ? 1 : 0,
      morpheme.synonymGroupIds.join(","),
    ].join("\u0001");
  }
}

export function createTokenizer(options: TokenizerLoadOptions): Tokenizer {
  return Tokenizer.create(options);
}
