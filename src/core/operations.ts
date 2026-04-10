import { readLookupEntryArray, readMorphemeArray, readPosMatcherIdArray } from "../ffi.ts";
import { createNativeSudachiError, type MorphemeResultLayout } from "../native.ts";
import { readOwnedNativeResult } from "../native-session.ts";
import {
  SudachiError,
  type InfoSubset,
  type InfoSubsetField,
  type LookupEntry,
  type Morpheme,
  type PosMatcherPatterns,
  type TokenizeMode,
} from "../types.ts";
import { type MorphemeStateTracker } from "./morpheme-state.ts";
import { type NativeTokenizerSession, type TokenizerSessionManager } from "./session.ts";

const MODE_TO_NATIVE: Record<TokenizeMode, number> = {
  A: 0,
  B: 1,
  C: 2,
};

const INFO_SUBSET_FFI_POS_TEXT_BIT = 1 << 30;

const INFO_SUBSET_FIELD_BITS: Record<InfoSubsetField, number> = {
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

interface TokenizerExecutionContext {
  owner: object;
  session: TokenizerSessionManager;
  state: MorphemeStateTracker;
}

function normalizePosPattern(pattern: readonly (string | null | undefined)[]): (string | null)[] {
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
      throw new SudachiError("POS matcher patterns must contain only strings or null.", {
        code: "INVALID_ARGUMENT",
      });
    }

    normalized[index] = value;
  }

  return normalized;
}

function normalizePosPatterns(patterns: PosMatcherPatterns): string {
  const normalized = patterns.map((pattern) => normalizePosPattern(pattern));
  return JSON.stringify(normalized);
}

function infoSubsetBits(options: InfoSubset | undefined): number | null {
  if (options === undefined) {
    return null;
  }

  const fields = options.fields;
  if (fields === undefined) {
    return ALL_INFO_SUBSET_BITS;
  }

  let bits = 0;
  for (const field of fields) {
    const bit = INFO_SUBSET_FIELD_BITS[field];
    if (bit === undefined) {
      throw new SudachiError(`Unsupported info subset field: ${field}.`, {
        code: "INVALID_ARGUMENT",
      });
    }

    bits |= bit;
  }

  return bits;
}

function tokenizeFromSession(
  session: NativeTokenizerSession,
  layout: MorphemeResultLayout,
  state: MorphemeStateTracker,
  owner: object,
  text: string,
  mode: TokenizeMode,
  options: InfoSubset | undefined,
): Morpheme[] {
  const resultOut = new BigUint64Array(1);
  const subsetBits = infoSubsetBits(options);
  const status =
    subsetBits === null
      ? session.library.symbols.sudachi_tokenize(session.handle, text, MODE_TO_NATIVE[mode], resultOut)
      : session.library.symbols.sudachi_tokenize_subset(
          session.handle,
          text,
          MODE_TO_NATIVE[mode],
          subsetBits,
          resultOut,
        );
  if (status !== 0) {
    throw createNativeSudachiError(session.library, status, "Tokenization failed.");
  }

  return readOwnedNativeResult(
    resultOut,
    "Tokenizer returned a null result pointer.",
    (resultPtr) => session.library.symbols.sudachi_free_result(resultPtr),
    (resultPtr) => state.attach(owner, readMorphemeArray(resultPtr, layout), text, mode, "owned"),
  );
}

function splitSourceIndex(
  context: TokenizerExecutionContext,
  morpheme: Morpheme,
  morphemeState: ReturnType<MorphemeStateTracker["getMorphemeState"]>,
): number {
  if (morphemeState.listState.kind === "owned") {
    return morphemeState.index;
  }

  const list = tokenize(context, morphemeState.listState.text, morphemeState.listState.mode);
  for (const [index, candidate] of list.entries()) {
    if (morphemeMatches(candidate, morpheme)) {
      return index;
    }
  }

  throw new SudachiError("Failed to resolve the morpheme index from the source text.", {
    code: "INTERNAL",
    nativeStatus: 255,
  });
}

function morphemeMatches(left: Morpheme, right: Morpheme): boolean {
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
    sameSynonymGroupIds(left.synonymGroupIds, right.synonymGroupIds)
  );
}

function sameSynonymGroupIds(left: readonly number[], right: readonly number[]): boolean {
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

function tokenize(
  context: TokenizerExecutionContext,
  text: string,
  mode: TokenizeMode,
  options: InfoSubset | undefined,
): Morpheme[] {
  const { library, handle, layout } = context.session.getOpenSession();
  return tokenizeFromSession({ library, handle, layout }, layout, context.state, context.owner, text, mode, options);
}

export function tokenizeMorphemes(
  context: TokenizerExecutionContext,
  text: string,
  mode: TokenizeMode = "C",
  options: InfoSubset | undefined = undefined,
): Morpheme[] {
  return tokenize(context, text, mode, options);
}

export function lookupEntries(
  context: TokenizerExecutionContext,
  surface: string,
  options: InfoSubset | undefined = undefined,
): LookupEntry[] {
  const { handle } = context.session.getOpenSession();
  const { library, layout } = context.session.getLookupSession();

  const resultOut = new BigUint64Array(1);
  const subsetBits = infoSubsetBits(options);
  const status =
    subsetBits === null
      ? library.symbols.sudachi_lookup(handle, surface, resultOut)
      : library.symbols.sudachi_lookup_subset(handle, surface, subsetBits, resultOut);
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

export function compilePosMatcher(context: TokenizerExecutionContext, patterns: PosMatcherPatterns): number[] {
  const { library, handle } = context.session.getOpenSession();
  const layout = context.session.getPosMatcherLayout();
  const resultOut = new BigUint64Array(1);
  const status = library.symbols.sudachi_compile_pos_matcher(handle, normalizePosPatterns(patterns), resultOut);
  if (status !== 0) {
    throw createNativeSudachiError(library, status, "POS matcher compilation failed.");
  }

  return readOwnedNativeResult(
    resultOut,
    "POS matcher returned a null result pointer.",
    (resultPtr) => library.symbols.sudachi_free_pos_matcher_result(resultPtr),
    (resultPtr) => readPosMatcherIdArray(resultPtr, layout),
  );
}

export function splitMorpheme(
  context: TokenizerExecutionContext,
  morpheme: Morpheme,
  mode: TokenizeMode = "C",
): Morpheme[] {
  const { library, handle, layout } = context.session.getOpenSession();
  const morphemeState = context.state.getMorphemeState(context.owner, morpheme);
  const index = splitSourceIndex(context, morpheme, morphemeState);

  const resultOut = new BigUint64Array(1);
  const status = library.symbols.sudachi_split_morpheme(
    handle,
    morphemeState.listState.text,
    MODE_TO_NATIVE[morphemeState.listState.mode],
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
    (resultPtr) => context.state.attach(context.owner, readMorphemeArray(resultPtr, layout), morphemeState.listState.text, mode, "split"),
  );
}

export function splitMorphemes(
  context: TokenizerExecutionContext,
  morphemes: readonly Morpheme[],
  mode: TokenizeMode = "C",
): Morpheme[] {
  if (morphemes.length === 0) {
    return [];
  }

  const { library, handle, layout } = context.session.getOpenSession();
  const listState = context.state.getListState(morphemes);

  if (listState !== undefined && context.state.canUseWholeListSplit(morphemes, listState)) {
    if (listState.tokenizer !== context.owner) {
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
      (resultPtr) => context.state.attach(context.owner, readMorphemeArray(resultPtr, layout), listState.text, mode, "owned"),
    );
  }

  const results: Morpheme[] = [];
  for (const morpheme of morphemes) {
    results.push(...splitMorpheme(context, morpheme, mode));
  }

  return results;
}
