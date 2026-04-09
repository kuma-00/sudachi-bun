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
    const library = this.#library;
    const layout = this.#layout;
    const handle = this.#handle;
    if (library === null || layout === null || handle === null) {
      throw new SudachiError("Tokenizer has been closed.", {
        code: "TOKENIZER_CLOSED",
      });
    }

    const resultOut = new BigUint64Array(1);
    const status = library.symbols.sudachi_tokenize(handle, text, MODE_TO_NATIVE[mode], resultOut);
    if (status !== 0) {
      throw createNativeSudachiError(library, status, "Tokenization failed.");
    }

    const resultPtr = resultOut[0] ?? 0n;
    if (resultPtr === 0n) {
      throw new SudachiError("Tokenizer returned a null result pointer.", {
        code: "INTERNAL",
        nativeStatus: 255,
      });
    }

    const nativeResultPtr = toPointer(resultPtr);
    try {
      return readMorphemeArray(nativeResultPtr, layout);
    } finally {
      library.symbols.sudachi_free_result(nativeResultPtr);
    }
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
}

export function createTokenizer(options: TokenizerLoadOptions): Tokenizer {
  return Tokenizer.create(options);
}
