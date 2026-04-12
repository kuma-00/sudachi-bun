import type { Pointer } from "bun:ffi";

import {
  readLookupEntryArray,
  readMorphemeArray,
  readPosMatcherIdArray,
} from "../ffi.ts";
import { createNativeSudachiError } from "../native/error/mapper.ts";
import type {
  LookupResultLayout,
  MorphemeResultLayout,
  NativeLookupLibrary,
  NativeSudachiLibrary,
  PosMatcherResultLayout,
} from "../native/types.ts";
import { readOwnedNativeResult } from "../native-session.ts";
import {
  type InfoSubset,
  type LookupEntry,
  type Morpheme,
  type PosMatcherPatterns,
  SudachiError,
  type SurfaceProjection,
  type TokenizeMode,
} from "../types.ts";
import { resolveInfoSubsetBits } from "./info-subset.ts";

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

export interface NativeTokenizerSession {
  handle: Pointer;
  layout: MorphemeResultLayout;
  library: NativeSudachiLibrary;
}

export interface NativeLookupSession {
  layout: LookupResultLayout;
  library: NativeLookupLibrary;
}

interface TokenizerGatewayDeps {
  getOpenSession: () => NativeTokenizerSession;
  getLookupSession: () => NativeLookupSession;
  getPosMatcherLayout: () => PosMatcherResultLayout;
}

export interface TokenizerGateway {
  tokenize(
    text: string,
    projection: SurfaceProjection,
    mode: TokenizeMode,
    options?: InfoSubset,
  ): Morpheme[];
  lookup(
    surface: string,
    projection: SurfaceProjection,
    options?: InfoSubset,
  ): LookupEntry[];
  compilePosMatcher(patterns: PosMatcherPatterns): number[];
  splitMorpheme(
    sourceText: string,
    sourceMode: TokenizeMode,
    projection: SurfaceProjection,
    sourceIndex: number,
    splitMode: TokenizeMode,
  ): Morpheme[];
  splitMorphemes(
    sourceText: string,
    sourceMode: TokenizeMode,
    projection: SurfaceProjection,
    splitMode: TokenizeMode,
  ): Morpheme[];
}

function normalizePosPattern(
  pattern: readonly (string | null | undefined)[],
): (string | null)[] {
  if (pattern.length > 6) {
    throw new SudachiError("POS matcher patterns must have at most 6 items.", {
      code: "INVALID_ARGUMENT",
    });
  }

  const normalized = new Array<string | null>(6).fill(null);
  for (let index = 0; index < pattern.length; index += 1) {
    const value = pattern[index];
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value !== "string") {
      throw new SudachiError(
        "POS matcher patterns must contain only strings or null.",
        {
          code: "INVALID_ARGUMENT",
        },
      );
    }

    normalized[index] = value;
  }

  return normalized;
}

function normalizePosPatterns(patterns: PosMatcherPatterns): string {
  const normalized = patterns.map((pattern) => normalizePosPattern(pattern));
  return JSON.stringify(normalized);
}

export function createTokenizerGateway(
  deps: TokenizerGatewayDeps,
): TokenizerGateway {
  return {
    tokenize(text, projection, mode, options) {
      const { library, handle, layout } = deps.getOpenSession();
      const resultOut = new BigUint64Array(1);
      const subsetBits = resolveInfoSubsetBits(options);
      const status =
        subsetBits === null
          ? library.symbols.sudachi_tokenize(
              handle,
              text,
              MODE_TO_NATIVE[mode],
              PROJECTION_TO_NATIVE[projection],
              resultOut,
            )
          : library.symbols.sudachi_tokenize_subset(
              handle,
              text,
              MODE_TO_NATIVE[mode],
              PROJECTION_TO_NATIVE[projection],
              subsetBits,
              resultOut,
            );

      if (status !== 0) {
        throw createNativeSudachiError(library, status, "Tokenization failed.");
      }

      return readOwnedNativeResult(
        resultOut,
        "Tokenizer returned a null result pointer.",
        (resultPtr) => library.symbols.sudachi_free_result(resultPtr),
        (resultPtr) => readMorphemeArray(resultPtr, layout),
      );
    },

    lookup(surface, projection, options) {
      const { handle } = deps.getOpenSession();
      const { library, layout } = deps.getLookupSession();
      const resultOut = new BigUint64Array(1);
      const subsetBits = resolveInfoSubsetBits(options);
      const status =
        subsetBits === null
          ? library.symbols.sudachi_lookup(
              handle,
              surface,
              PROJECTION_TO_NATIVE[projection],
              resultOut,
            )
          : library.symbols.sudachi_lookup_subset(
              handle,
              surface,
              PROJECTION_TO_NATIVE[projection],
              subsetBits,
              resultOut,
            );

      if (status !== 0) {
        throw createNativeSudachiError(library, status, "Lookup failed.");
      }

      return readOwnedNativeResult(
        resultOut,
        "Lookup returned a null result pointer.",
        (resultPtr) => library.symbols.sudachi_free_lookup_result(resultPtr),
        (resultPtr) => readLookupEntryArray(resultPtr, layout),
      );
    },

    compilePosMatcher(patterns) {
      const { library, handle } = deps.getOpenSession();
      const layout = deps.getPosMatcherLayout();
      const resultOut = new BigUint64Array(1);
      const status = library.symbols.sudachi_compile_pos_matcher(
        handle,
        normalizePosPatterns(patterns),
        resultOut,
      );
      if (status !== 0) {
        throw createNativeSudachiError(
          library,
          status,
          "POS matcher compilation failed.",
        );
      }

      return readOwnedNativeResult(
        resultOut,
        "POS matcher returned a null result pointer.",
        (resultPtr) =>
          library.symbols.sudachi_free_pos_matcher_result(resultPtr),
        (resultPtr) => readPosMatcherIdArray(resultPtr, layout),
      );
    },

    splitMorpheme(sourceText, sourceMode, projection, sourceIndex, splitMode) {
      const { library, handle, layout } = deps.getOpenSession();
      const resultOut = new BigUint64Array(1);
      const status = library.symbols.sudachi_split_morpheme(
        handle,
        sourceText,
        MODE_TO_NATIVE[sourceMode],
        PROJECTION_TO_NATIVE[projection],
        sourceIndex,
        MODE_TO_NATIVE[splitMode],
        resultOut,
      );

      if (status !== 0) {
        throw createNativeSudachiError(
          library,
          status,
          "Morpheme split failed.",
        );
      }

      return readOwnedNativeResult(
        resultOut,
        "Tokenizer returned a null morpheme split pointer.",
        (resultPtr) => library.symbols.sudachi_free_result(resultPtr),
        (resultPtr) => readMorphemeArray(resultPtr, layout),
      );
    },

    splitMorphemes(sourceText, sourceMode, projection, splitMode) {
      const { library, handle, layout } = deps.getOpenSession();
      const resultOut = new BigUint64Array(1);
      const status = library.symbols.sudachi_split_morphemes(
        handle,
        sourceText,
        MODE_TO_NATIVE[sourceMode],
        PROJECTION_TO_NATIVE[projection],
        MODE_TO_NATIVE[splitMode],
        resultOut,
      );

      if (status !== 0) {
        throw createNativeSudachiError(
          library,
          status,
          "Morpheme list split failed.",
        );
      }

      return readOwnedNativeResult(
        resultOut,
        "Tokenizer returned a null morpheme list split pointer.",
        (resultPtr) => library.symbols.sudachi_free_result(resultPtr),
        (resultPtr) => readMorphemeArray(resultPtr, layout),
      );
    },
  };
}
