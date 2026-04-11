import { type Pointer } from "bun:ffi";

import { readPretokenizedArray } from "./ffi.ts";
import { openNativeHandleSession, readOwnedNativeResult } from "./native-session.ts";
import {
  createNativeSudachiError,
  loadPretokenizerLibrary,
  readPretokenizedResultLayout,
  type NativePretokenizerLibrary,
  type PretokenizedResultLayout,
} from "./native.ts";
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

const INFO_SUBSET_FFI_POS_TEXT_BIT = 1 << 30;

const INFO_SUBSET_FIELD_BITS: Record<
  "surface" | "pos" | "posId" | "normalized" | "dictionaryForm" | "reading" | "synonymGroupIds",
  number
> = {
  surface: 1 << 0,
  pos: (1 << 2) | INFO_SUBSET_FFI_POS_TEXT_BIT,
  posId: 1 << 2,
  normalized: 1 << 3,
  dictionaryForm: 1 << 4,
  reading: 1 << 5,
  synonymGroupIds: 1 << 9,
};

const ALL_INFO_SUBSET_BITS =
  INFO_SUBSET_FIELD_BITS.surface |
  INFO_SUBSET_FIELD_BITS.pos |
  INFO_SUBSET_FIELD_BITS.posId |
  INFO_SUBSET_FIELD_BITS.normalized |
  INFO_SUBSET_FIELD_BITS.dictionaryForm |
  INFO_SUBSET_FIELD_BITS.reading |
  INFO_SUBSET_FIELD_BITS.synonymGroupIds;

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
  const uniqueOffsets = [...new Set(offsets)].sort((left, right) => left - right);
  const totalBytes = Buffer.byteLength(text, "utf8");

  for (const offset of uniqueOffsets) {
    if (!Number.isInteger(offset) || offset < 0 || offset > totalBytes) {
      invalidPretokenizedResult(`Pretokenizer returned an out-of-range byte offset: ${offset}.`);
    }
  }

  const resolved = new Map<number, number>();
  let targetIndex = 0;

  while (targetIndex < uniqueOffsets.length && uniqueOffsets[targetIndex] === 0) {
    resolved.set(0, 0);
    targetIndex += 1;
  }

  let byteOffset = 0;
  for (let textIndex = 0; textIndex < text.length && targetIndex < uniqueOffsets.length; ) {
    const codePoint = text.codePointAt(textIndex);
    if (codePoint === undefined) {
      break;
    }

    const codePointText = String.fromCodePoint(codePoint);
    byteOffset += Buffer.byteLength(codePointText, "utf8");
    textIndex += codePoint > 0xffff ? 2 : 1;

    while (targetIndex < uniqueOffsets.length && uniqueOffsets[targetIndex] === byteOffset) {
      resolved.set(byteOffset, textIndex);
      targetIndex += 1;
    }
  }

  if (targetIndex !== uniqueOffsets.length) {
    invalidPretokenizedResult(
      `Pretokenizer returned a byte offset that does not align to a UTF-8 boundary: ${uniqueOffsets[targetIndex]}.`,
    );
  }

  return resolved;
}

function resolveInfoSubsetBits(options: InfoSubset | undefined): number | null {
  if (options === undefined) {
    return null;
  }

  const fields = options.fields;
  if (fields === undefined) {
    return ALL_INFO_SUBSET_BITS;
  }

  let bits = 0;
  for (const field of fields) {
    const bit = INFO_SUBSET_FIELD_BITS[field as keyof typeof INFO_SUBSET_FIELD_BITS];
    if (bit === undefined) {
      throw new SudachiError(`Unsupported info subset field: ${field}.`, {
        code: "INVALID_ARGUMENT",
      });
    }

    bits |= bit;
  }

  return bits;
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
