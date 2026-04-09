import { type Pointer } from "bun:ffi";

import { readLookupEntryArray, readMorphemeArray } from "./ffi.ts";
import { openNativeHandleSession, readOwnedNativeResult } from "./native-session.ts";
import {
  createNativeSudachiError,
  loadLookupLibrary,
  loadNativeLibrary,
  readLookupResultLayout,
  readMorphemeResultLayout,
  type LookupResultLayout,
  type NativeLookupLibrary,
  type MorphemeResultLayout,
  type NativeSudachiLibrary,
} from "./native.ts";
import { SudachiError, type LookupEntry, type Morpheme, type TokenizeMode, type TokenizerLoadOptions } from "./types.ts";

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

interface NativeTokenizerSession {
  handle: Pointer;
  layout: MorphemeResultLayout;
  library: NativeSudachiLibrary;
}

interface NativeLookupSession {
  layout: LookupResultLayout;
  library: NativeLookupLibrary;
}

function openNativeTokenizer(options: TokenizerLoadOptions): NativeTokenizerSession {
  const library = loadNativeLibrary(options);
  return openNativeHandleSession(
    library,
    readMorphemeResultLayout,
    (loadedLibrary, handleOut) =>
      loadedLibrary.symbols.sudachi_create_tokenizer(
        options.configPath ?? null,
        options.resourceDir ?? null,
        options.dictPath,
        handleOut,
      ),
    (loadedLibrary, status) => createNativeSudachiError(loadedLibrary, status, "Failed to create the tokenizer."),
    "Tokenizer handle was null after initialization.",
  );
}

export class Tokenizer {
  static create(options: TokenizerLoadOptions): Tokenizer {
    return Tokenizer.load(options);
  }

  static load(options: TokenizerLoadOptions): Tokenizer {
    return new Tokenizer(openNativeTokenizer(options), options);
  }

  #library: NativeSudachiLibrary | null;
  #layout: MorphemeResultLayout | null;
  #handle: Pointer | null;
  #lookupLibrary: NativeLookupLibrary | null;
  #lookupLayout: LookupResultLayout | null;
  #loadOptions: TokenizerLoadOptions;

  private constructor(session: NativeTokenizerSession, options: TokenizerLoadOptions) {
    this.#library = session.library;
    this.#layout = session.layout;
    this.#handle = session.handle;
    this.#lookupLibrary = null;
    this.#lookupLayout = null;
    this.#loadOptions = { ...options };
  }

  get closed(): boolean {
    return this.#library === null || this.#handle === null || this.#layout === null;
  }

  tokenize(text: string, mode: TokenizeMode = "C"): Morpheme[] {
    const { library, handle, layout } = this.#getOpenSession();

    const resultOut = new BigUint64Array(1);
    const status = library.symbols.sudachi_tokenize(handle, text, MODE_TO_NATIVE[mode], resultOut);
    if (status !== 0) {
      throw createNativeSudachiError(library, status, "Tokenization failed.");
    }

    return readOwnedNativeResult(
      resultOut,
      "Tokenizer returned a null result pointer.",
      (resultPtr) => library.symbols.sudachi_free_result(resultPtr),
      (resultPtr) => this.#attachMorphemeState(readMorphemeArray(resultPtr, layout), text, mode, "owned"),
    );
  }

  lookup(surface: string): LookupEntry[] {
    const { handle } = this.#getOpenSession();
    const { library, layout } = this.#getLookupSession();

    const resultOut = new BigUint64Array(1);
    const status = library.symbols.sudachi_lookup(handle, surface, resultOut);
    if (status !== 0) {
      throw createNativeSudachiError(library, status, "Lookup failed.");
    }

    return readOwnedNativeResult(
      resultOut,
      "Lookup returned a null result pointer.",
      (resultPtr) => library.symbols.sudachi_free_lookup_result(resultPtr),
      (resultPtr) => readLookupEntryArray(resultPtr, layout),
    );
  }

  split(morpheme: Morpheme, mode: TokenizeMode = "C"): Morpheme[] {
    const { library, handle, layout } = this.#getOpenSession();
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

    return readOwnedNativeResult(
      resultOut,
      "Tokenizer returned a null morpheme split pointer.",
      (resultPtr) => library.symbols.sudachi_free_result(resultPtr),
      (resultPtr) => this.#attachMorphemeState(readMorphemeArray(resultPtr, layout), state.listState.text, mode, "split"),
    );
  }

  splitInto(morphemes: readonly Morpheme[], mode: TokenizeMode = "C"): Morpheme[] {
    if (morphemes.length === 0) {
      return [];
    }

    const { library, handle, layout } = this.#getOpenSession();
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

      return readOwnedNativeResult(
        resultOut,
        "Tokenizer returned a null morpheme list split pointer.",
        (resultPtr) => library.symbols.sudachi_free_result(resultPtr),
        (resultPtr) => this.#attachMorphemeState(readMorphemeArray(resultPtr, layout), listState.text, mode, "owned"),
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

    if (this.#lookupLibrary !== null) {
      this.#lookupLibrary.close();
      this.#lookupLibrary = null;
    }

    this.#lookupLayout = null;

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

  #getLookupSession(): NativeLookupSession {
    this.#getOpenSession();

    if (this.#lookupLibrary !== null && this.#lookupLayout !== null) {
      return {
        library: this.#lookupLibrary,
        layout: this.#lookupLayout,
      };
    }

    const library = loadLookupLibrary(this.#loadOptions);
    try {
      const layout = readLookupResultLayout(library);
      this.#lookupLibrary = library;
      this.#lookupLayout = layout;
      return { library, layout };
    } catch (error) {
      library.close();
      throw error;
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
