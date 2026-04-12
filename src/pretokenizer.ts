import { type Pointer } from "bun:ffi";

import { readPretokenizedArray } from "./ffi.ts";
import { openNativeHandleSession, readOwnedNativeResult } from "./native-session.ts";
import { createNativeSudachiError } from "./native/error/mapper.ts";
import {
  loadPretokenizerLibrary,
  readPretokenizedResultLayout,
} from "./native.ts";
import type { NativePretokenizerLibrary, PretokenizedResultLayout } from "./native/types.ts";
import { resolveInfoSubsetBits } from "./core/info-subset.ts";
import { createUtf8ByteOffsetIndexMap } from "./shared/utf8-offset.ts";
import {
  parseSurfaceProjection,
  parseTokenizeMode,
  SudachiError,
  type InfoSubset,
  type PretokenizeOptions,
  type PretokenizedResult,
  type PretokenizedToken,
  type PretokenizerOptions,
  type SurfaceProjection,
  type TokenizeMode,
} from "./types.ts";

export * from "./pretokenizer-hf.ts";

interface NativePretokenizerSession {
  handle: Pointer;
  layout: PretokenizedResultLayout;
  library: NativePretokenizerLibrary;
}

interface PretokenizerRuntimeOptions {
  mode: TokenizeMode;
  projection: SurfaceProjection;
  subset?: InfoSubset;
}

function invalidPretokenizedResult(message: string): never {
  throw new SudachiError(message, {
    code: "INTERNAL",
    nativeStatus: 255,
  });
}

function createByteOffsetIndexMap(text: string, offsets: readonly number[]): Map<number, number> {
  return createUtf8ByteOffsetIndexMap(text, offsets, {
    throwInvalid: (message) => invalidPretokenizedResult(message),
    messages: {
      outOfRange: (offset) => `Pretokenizer returned an out-of-range byte offset: ${offset}.`,
      notBoundary: (offset) =>
        `Pretokenizer returned a byte offset that does not align to a UTF-8 boundary: ${offset}.`,
    },
  });
}

function normalizePretokenizedTokens(text: string, tokens: readonly PretokenizedToken[]): PretokenizedToken[] {
  if (tokens.length === 0) {
    return [];
  }

  const byteBoundaries: number[] = [];
  for (const token of tokens) {
    if (token.beginByte > token.endByte) {
      invalidPretokenizedResult(
        `Pretokenizer returned an inverted token span: ${token.beginByte}..${token.endByte}.`,
      );
    }

    if (token.beginChar > token.endChar) {
      invalidPretokenizedResult(
        `Pretokenizer returned an inverted character span: ${token.beginChar}..${token.endChar}.`,
      );
    }

    byteBoundaries.push(token.beginByte, token.endByte);
  }

  const indexMap = createByteOffsetIndexMap(text, byteBoundaries);
  return tokens.map((token) => {
    const beginChar = indexMap.get(token.beginByte);
    const endChar = indexMap.get(token.endByte);
    if (beginChar === undefined || endChar === undefined) {
      invalidPretokenizedResult(
        `Pretokenizer returned an unreadable token span: ${token.beginByte}..${token.endByte}.`,
      );
    }

    if (beginChar !== token.beginChar || endChar !== token.endChar) {
      invalidPretokenizedResult(
        [
          "Pretokenizer returned inconsistent byte and character offsets:",
          `${token.beginByte}..${token.endByte} -> ${token.beginChar}..${token.endChar},`,
          `expected ${beginChar}..${endChar}.`,
        ].join(" "),
      );
    }

    return {
      ...token,
      beginChar,
      endChar,
    };
  });
}

function normalizeRuntimeOptions(
  defaults: PretokenizerRuntimeOptions,
  options: PretokenizeOptions | undefined,
): PretokenizerRuntimeOptions {
  return {
    mode: parseTokenizeMode(options?.mode ?? defaults.mode),
    projection: parseSurfaceProjection(options?.projection ?? defaults.projection),
    subset: options?.subset ?? defaults.subset,
  };
}

function openNativePretokenizer(options: PretokenizerOptions): NativePretokenizerSession {
  const library = loadPretokenizerLibrary(options);
  return openNativeHandleSession(
    library,
    readPretokenizedResultLayout,
    (loadedLibrary, handleOut) =>
      loadedLibrary.symbols.sudachi_create_pretokenizer(
        options.configPath ?? null,
        options.resourceDir ?? null,
        options.dictPath,
        handleOut,
      ),
    (loadedLibrary, status) =>
      createNativeSudachiError(loadedLibrary, status, "Failed to create the pretokenizer."),
    "Pretokenizer handle was null after initialization.",
  );
}

function setNativePretokenizerDebug(
  session: NativePretokenizerSession,
  debug: boolean | undefined,
): void {
  const setDebug = session.library.symbols.sudachi_set_pretokenizer_debug;
  if (setDebug === undefined) {
    return;
  }

  const status = setDebug(session.handle, debug ? 1 : 0);
  if (status !== 0) {
    throw createNativeSudachiError(session.library, status, "Failed to configure pretokenizer debug mode.");
  }
}

export class Pretokenizer {
  #library: NativePretokenizerLibrary | null;
  #layout: PretokenizedResultLayout | null;
  #handle: Pointer | null;
  #defaults: PretokenizerRuntimeOptions;

  constructor(session: NativePretokenizerSession, defaults: PretokenizeOptions = {}) {
    this.#library = session.library;
    this.#layout = session.layout;
    this.#handle = session.handle;
    this.#defaults = {
      mode: parseTokenizeMode(defaults.mode ?? "C"),
      projection: parseSurfaceProjection(defaults.projection ?? "surface"),
      subset: defaults.subset,
    };
  }

  get closed(): boolean {
    return this.#library === null || this.#handle === null || this.#layout === null;
  }

  pretokenize(text: string, options?: PretokenizeOptions): PretokenizedResult {
    const library = this.#library;
    const layout = this.#layout;
    const handle = this.#handle;
    if (library === null || layout === null || handle === null) {
      throw new SudachiError("Pretokenizer has been closed.", {
        code: "PRETOKENIZER_CLOSED",
      });
    }

    if (text.length === 0) {
      return [];
    }

    const resolved = normalizeRuntimeOptions(this.#defaults, options);
    const resultOut = new BigUint64Array(1);
    const subsetBits = resolveInfoSubsetBits(resolved.subset);
    const status =
      subsetBits === null
        ? library.symbols.sudachi_pretokenize(
            handle,
            text,
            MODE_TO_NATIVE[resolved.mode],
            PROJECTION_TO_NATIVE[resolved.projection],
            resultOut,
          )
        : library.symbols.sudachi_pretokenize_subset(
            handle,
            text,
            MODE_TO_NATIVE[resolved.mode],
            PROJECTION_TO_NATIVE[resolved.projection],
            subsetBits,
            resultOut,
          );

    if (status !== 0) {
      throw createNativeSudachiError(library, status, "Pretokenization failed.");
    }

    return readOwnedNativeResult(
      resultOut,
      "Pretokenizer returned a null result pointer.",
      (resultPtr) => library.symbols.sudachi_free_pretokenized_result(resultPtr),
      (resultPtr) => normalizePretokenizedTokens(text, readPretokenizedArray(resultPtr, layout)),
    );
  }

  close(): void {
    if (this.#library === null) {
      return;
    }

    if (this.#handle !== null) {
      this.#library.symbols.sudachi_free_pretokenizer(this.#handle);
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

export function createPretokenizer(options: PretokenizerOptions): Pretokenizer {
  const session = openNativePretokenizer(options);
  try {
    setNativePretokenizerDebug(session, options.debug);
    return new Pretokenizer(session, options);
  } catch (error) {
    session.library.symbols.sudachi_free_pretokenizer(session.handle);
    session.library.close();
    throw error;
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
};
