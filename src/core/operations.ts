import { readLookupEntryArray, readMorphemeArray, readPosMatcherIdArray } from "../ffi.ts";
import { createNativeSudachiError, type MorphemeResultLayout } from "../native.ts";
import { readOwnedNativeResult } from "../native-session.ts";
import { SudachiError, type LookupEntry, type Morpheme, type PosMatcherPatterns, type TokenizeMode } from "../types.ts";
import { type MorphemeStateTracker } from "./morpheme-state.ts";
import { type NativeTokenizerSession, type TokenizerSessionManager } from "./session.ts";

const MODE_TO_NATIVE: Record<TokenizeMode, number> = {
  A: 0,
  B: 1,
  C: 2,
};

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

function tokenizeFromSession(
  session: NativeTokenizerSession,
  layout: MorphemeResultLayout,
  state: MorphemeStateTracker,
  owner: object,
  text: string,
  mode: TokenizeMode,
): Morpheme[] {
  const resultOut = new BigUint64Array(1);
  const status = session.library.symbols.sudachi_tokenize(session.handle, text, MODE_TO_NATIVE[mode], resultOut);
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

function tokenize(context: TokenizerExecutionContext, text: string, mode: TokenizeMode): Morpheme[] {
  const { library, handle, layout } = context.session.getOpenSession();
  return tokenizeFromSession({ library, handle, layout }, layout, context.state, context.owner, text, mode);
}

export function tokenizeMorphemes(context: TokenizerExecutionContext, text: string, mode: TokenizeMode = "C"): Morpheme[] {
  return tokenize(context, text, mode);
}

export function lookupEntries(context: TokenizerExecutionContext, surface: string): LookupEntry[] {
  const { handle } = context.session.getOpenSession();
  const { library, layout } = context.session.getLookupSession();

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
