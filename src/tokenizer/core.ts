import { type Pointer } from "bun:ffi";

import { readMorphemeArray, setMorphemeResultLayout } from "./ffi.ts";
import {
  loadNativeLibrary,
  readMorphemeResultLayout,
  readNativeError,
  type NativeSudachiLibrary,
} from "./native.ts";
import { SudachiError, type Morpheme, type TokenizeMode, type TokenizerOptions } from "./types.ts";

const MODE_TO_NATIVE: Record<TokenizeMode, number> = {
  A: 0,
  B: 1,
  C: 2,
};

function toPointer(value: number | bigint): Pointer {
  return Number(value) as Pointer;
}

export class Tokenizer {
  #library: NativeSudachiLibrary | null = null;
  #handle: Pointer | null = null;

  constructor(options: TokenizerOptions) {
    this.#library = loadNativeLibrary(options);

    try {
      setMorphemeResultLayout(readMorphemeResultLayout(this.#library));
    } catch (error) {
      this.#library.close();
      this.#library = null;
      throw error;
    }

    const handleOut = new BigUint64Array(1);
    const status = this.#library.symbols.sudachi_create_tokenizer(
      options.dictPath,
      options.configPath ?? null,
      handleOut,
    );

    if (status !== 0) {
      const message = readNativeError(this.#library);
      this.#library.close();
      this.#library = null;
      throw new SudachiError(message || "Failed to create tokenizer.", status);
    }

    const handleValue = handleOut[0] ?? 0n;
    if (handleValue === 0n) {
      const message = readNativeError(this.#library);
      this.#library.close();
      this.#library = null;
      throw new SudachiError(message || "Tokenizer handle was null.", status);
    }

    this.#handle = toPointer(handleValue);
  }

  tokenize(text: string, mode: TokenizeMode): Morpheme[] {
    const library = this.#library;
    const handle = this.#handle;
    if (!library || !handle) {
      throw new Error("Tokenizer has been closed.");
    }

    const resultOut = new BigUint64Array(1);
    const status = library.symbols.sudachi_tokenize(
      handle,
      text,
      MODE_TO_NATIVE[mode],
      resultOut,
    );

    if (status !== 0) {
      const message = readNativeError(library);
      throw new SudachiError(message || "Tokenization failed.", status);
    }

    const resultPtr = resultOut[0] ?? 0n;
    if (resultPtr === 0n) {
      throw new SudachiError("Tokenizer returned a null result pointer.", status);
    }

    const nativeResultPtr = toPointer(resultPtr);
    try {
      return readMorphemeArray(nativeResultPtr);
    } finally {
      library.symbols.sudachi_free_result(nativeResultPtr);
    }
  }

  close(): void {
    if (!this.#library) {
      return;
    }

    if (this.#handle) {
      this.#library.symbols.sudachi_free_tokenizer(this.#handle);
      this.#handle = null;
    }

    this.#library.close();
    this.#library = null;
  }
}

export function createTokenizer(options: TokenizerOptions): Tokenizer {
  return new Tokenizer(options);
}
