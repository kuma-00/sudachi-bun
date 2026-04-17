import type { Pointer } from "bun:ffi";
import { resolveInfoSubsetBits } from "./core/info-subset.ts";
import { MorphemeStateTracker } from "./core/morpheme-state.ts";
import {
  compilePosMatcher,
  lookupEntries,
  rememberTokenProjection,
  splitMorpheme,
  splitMorphemes,
  tokenizeMorphemes,
} from "./core/operations.ts";
import { TokenizerSessionManager } from "./core/session.ts";
import { readMorphemeArray } from "./ffi.ts";
import { createNativeSudachiError } from "./native/error/mapper.ts";
import { readOwnedNativeResult } from "./native-session.ts";
import type {
  CreatePosMatcherArgs,
  InfoSubset,
  LookupArgs,
  LookupEntry,
  Morpheme,
  MorphemeList,
  SplitArgs,
  SplitIntoArgs,
  StatefulTokenizeArgs,
  StatefulTokenizerOptions,
  SurfaceProjection,
  TokenizeArgs,
  TokenizeMode,
  TokenizerOptions,
} from "./types.ts";
import { SudachiError as SudachiErrorClass } from "./types.ts";

export { createPretokenizer, Pretokenizer } from "./pretokenizer.ts";

export class PosMatcher {
  #posIds: Set<number>;

  constructor(posIds: readonly number[]) {
    this.#posIds = new Set(posIds);
  }

  matches(posId: number): boolean;
  matches(morpheme: Morpheme): boolean;
  matches(entry: LookupEntry): boolean;
  matches(value: number | Morpheme | LookupEntry): boolean {
    if (typeof value === "number") {
      return this.#posIds.has(value);
    }

    return typeof value.posId === "number" && this.#posIds.has(value.posId);
  }

  filter<T extends { posId?: number }>(items: readonly T[]): T[] {
    return items.filter(
      (item) => typeof item.posId === "number" && this.#posIds.has(item.posId),
    );
  }
}

export class Tokenizer {
  #session: TokenizerSessionManager;
  #state: MorphemeStateTracker;
  #statefulTokenizers: Set<StatefulTokenizer>;

  constructor(session: TokenizerSessionManager, state: MorphemeStateTracker) {
    this.#session = session;
    this.#state = state;
    this.#statefulTokenizers = new Set();
  }

  get closed(): boolean {
    return this.#session.closed;
  }

  tokenize({
    text,
    projection,
    mode = "C",
    subset,
  }: TokenizeArgs): MorphemeList {
    return tokenizeMorphemes(this.#context(), text, projection, mode, subset);
  }

  createStatefulTokenizer(
    options: StatefulTokenizerOptions = {},
  ): StatefulTokenizer {
    const stateful = new StatefulTokenizer(
      this.#session,
      this.#state,
      this,
      options,
      (closed) => {
        this.#statefulTokenizers.delete(closed);
      },
    );
    this.#statefulTokenizers.add(stateful);
    return stateful;
  }

  lookup({ surface, projection, subset }: LookupArgs): LookupEntry[] {
    return lookupEntries(this.#context(), surface, projection, subset);
  }

  createPosMatcher({ patterns }: CreatePosMatcherArgs): PosMatcher {
    return new PosMatcher(compilePosMatcher(this.#context(), patterns));
  }

  split({ morpheme, projection, mode = "C" }: SplitArgs): MorphemeList {
    return splitMorpheme(this.#context(), morpheme, projection, mode);
  }

  splitInto({
    morphemes,
    projection,
    mode = "C",
  }: SplitIntoArgs): MorphemeList {
    return splitMorphemes(this.#context(), morphemes, projection, mode);
  }

  close(): void {
    for (const stateful of [...this.#statefulTokenizers]) {
      stateful.close();
    }
    this.#session.close();
  }

  [Symbol.dispose](): void {
    this.close();
  }

  #context(): {
    owner: object;
    session: TokenizerSessionManager;
    state: MorphemeStateTracker;
  } {
    return {
      owner: this,
      session: this.#session,
      state: this.#state,
    };
  }
}

export class StatefulTokenizer {
  #owner: object;
  #session: TokenizerSessionManager;
  #state: MorphemeStateTracker;
  #handle: Pointer | null;
  #text: string;
  #mode: TokenizeMode;
  #onClose: (tokenizer: StatefulTokenizer) => void;

  constructor(
    session: TokenizerSessionManager,
    state: MorphemeStateTracker,
    owner: object,
    options: StatefulTokenizerOptions = {},
    onClose: (tokenizer: StatefulTokenizer) => void = () => {},
  ) {
    this.#owner = owner;
    this.#session = session;
    this.#state = state;
    this.#text = "";
    this.#mode = "C";
    this.#onClose = onClose;

    const { library, handle } = this.#session.getOpenSession();
    const outHandle = new BigUint64Array(1);
    const status =
      library.symbols.sudachi_create_stateful_tokenizer_from_tokenizer(
        handle,
        outHandle,
      );
    if (status !== 0) {
      throw createNativeSudachiError(
        library,
        status,
        "Failed to create stateful tokenizer.",
      );
    }
    const handleValue = outHandle[0] ?? 0n;
    if (handleValue === 0n) {
      throw new SudachiErrorClass(
        "Failed to create stateful tokenizer: received a null native handle.",
        {
          code: "INTERNAL",
          nativeStatus: 255,
        },
      );
    }
    this.#handle = Number(handleValue) as Pointer;

    try {
      if (options.mode !== undefined) {
        this.setMode(options.mode);
      }
      if (options.subset !== undefined) {
        this.setSubset(options.subset);
      }
      this.reset(options.text ?? "");
    } catch (error) {
      this.close();
      throw error;
    }
  }

  get closed(): boolean {
    return this.#handle === null || this.#session.closed;
  }

  reset(text = ""): this {
    const { library, handle } = this.#openHandles();
    const status = library.symbols.sudachi_stateful_tokenizer_reset(
      handle,
      text,
    );
    if (status !== 0) {
      throw createNativeSudachiError(library, status, "Stateful reset failed.");
    }
    this.#text = text;
    return this;
  }

  setMode(mode: TokenizeMode): this {
    const { library, handle } = this.#openHandles();
    const status = library.symbols.sudachi_stateful_tokenizer_set_mode(
      handle,
      MODE_TO_NATIVE[mode],
    );
    if (status !== 0) {
      throw createNativeSudachiError(
        library,
        status,
        "Stateful mode update failed.",
      );
    }
    this.#mode = mode;
    return this;
  }

  setSubset(subset: InfoSubset | undefined): this {
    const { library, handle } = this.#openHandles();
    const subsetBits = resolveInfoSubsetBits(subset ?? {});
    const status = library.symbols.sudachi_stateful_tokenizer_set_subset(
      handle,
      subsetBits ?? 0,
    );
    if (status !== 0) {
      throw createNativeSudachiError(
        library,
        status,
        "Stateful subset update failed.",
      );
    }
    return this;
  }

  doTokenize({ projection }: StatefulTokenizeArgs): MorphemeList {
    const { library, layout, handle } = this.#openHandles();
    const outResult = new BigUint64Array(1);
    const status = library.symbols.sudachi_stateful_tokenizer_do_tokenize(
      handle,
      PROJECTION_TO_NATIVE[projection],
      outResult,
    );
    if (status !== 0) {
      throw createNativeSudachiError(
        library,
        status,
        "Stateful tokenization failed.",
      );
    }

    const morphemes = readOwnedNativeResult(
      outResult,
      "Stateful tokenizer returned a null result pointer.",
      (resultPtr) => library.symbols.sudachi_free_result(resultPtr),
      (resultPtr) => readMorphemeArray(resultPtr, layout),
    );

    const attached = this.#state.attach(
      this.#owner,
      morphemes,
      this.#text,
      this.#mode,
      "owned",
    );
    rememberTokenProjection(attached, projection);
    return attached;
  }

  tokenize(args: StatefulTokenizeArgs): MorphemeList {
    return this.doTokenize(args);
  }

  close(): void {
    if (this.#handle === null) {
      return;
    }

    try {
      const { library } = this.#session.getOpenSession();
      library.symbols.sudachi_free_stateful_tokenizer(this.#handle);
    } catch {
      // Tokenizer session may already be closed.
    } finally {
      this.#onClose(this);
      this.#handle = null;
    }
  }

  [Symbol.dispose](): void {
    this.close();
  }

  #assertOpen(): void {
    if (this.#handle === null) {
      throw new SudachiErrorClass("StatefulTokenizer has been closed.", {
        code: "TOKENIZER_CLOSED",
      });
    }
  }

  #openHandles(): {
    library: ReturnType<TokenizerSessionManager["getOpenSession"]>["library"];
    layout: ReturnType<TokenizerSessionManager["getOpenSession"]>["layout"];
    handle: Pointer;
  } {
    this.#assertOpen();
    const session = this.#session.getOpenSession();
    return {
      library: session.library,
      layout: session.layout,
      handle: this.#handle as Pointer,
    };
  }
}

const MODE_TO_NATIVE: Record<TokenizeMode, number> = {
  A: 0,
  B: 1,
  C: 2,
};

const PROJECTION_TO_NATIVE: Record<SurfaceProjection, number> = {
  surface: 0,
  normalized: 1,
  dictionary_form: 2,
  reading: 3,
  dictionary_and_surface: 4,
  normalized_and_surface: 5,
  normalized_nouns: 6,
};

export function createTokenizer(options: TokenizerOptions): Tokenizer {
  return new Tokenizer(
    new TokenizerSessionManager(options),
    new MorphemeStateTracker(),
  );
}
