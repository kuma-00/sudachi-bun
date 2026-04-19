import {
  type InfoSubset,
  type LookupEntry,
  type Morpheme,
  type MorphemeList,
  type PosMatcherPatterns,
  type PosTuple,
  SudachiError,
  type SurfaceProjection,
  type TokenizeMode,
} from "../types.ts";
import type { MorphemeStateTracker } from "./morpheme-state.ts";
import type { TokenizerGateway, TokenizerSessionManager } from "./session.ts";

const MORPHEME_PROJECTIONS = new WeakMap<Morpheme, SurfaceProjection>();

interface TokenizerExecutionContext {
  owner: object;
  session: TokenizerSessionManager;
  state: MorphemeStateTracker;
}

function getGateway(context: TokenizerExecutionContext): TokenizerGateway {
  return context.session.getGateway();
}

function rememberMorphemeProjection(
  morphemes: readonly Morpheme[],
  projection: SurfaceProjection,
): void {
  for (const morpheme of morphemes) {
    MORPHEME_PROJECTIONS.set(morpheme, projection);
  }
}

export function rememberTokenProjection(
  morphemes: readonly Morpheme[],
  projection: SurfaceProjection,
): void {
  rememberMorphemeProjection(morphemes, projection);
}

function morphemeProjection(
  morpheme: Morpheme,
  fallback: SurfaceProjection,
): SurfaceProjection {
  return MORPHEME_PROJECTIONS.get(morpheme) ?? fallback;
}

function splitSourceIndex(
  context: TokenizerExecutionContext,
  projection: SurfaceProjection,
  morpheme: Morpheme,
  morphemeState: ReturnType<MorphemeStateTracker["getMorphemeState"]>,
): number {
  if (morphemeState.listState.kind === "owned") {
    return morphemeState.index;
  }

  const sourceProjection = morphemeProjection(morpheme, projection);
  const list = tokenize(
    context,
    morphemeState.listState.text,
    sourceProjection,
    morphemeState.listState.mode,
  );
  for (const [index, candidate] of list.entries()) {
    if (morphemeMatches(candidate, morpheme)) {
      return index;
    }
  }

  throw new SudachiError(
    "Failed to resolve the morpheme index from the source text.",
    {
      code: "INTERNAL",
      nativeStatus: 255,
    },
  );
}

function morphemeMatches(left: Morpheme, right: Morpheme): boolean {
  return (
    left.begin === right.begin &&
    left.end === right.end &&
    left.beginChar === right.beginChar &&
    left.endChar === right.endChar &&
    left.normalized === right.normalized &&
    left.dictionaryForm === right.dictionaryForm &&
    left.reading === right.reading &&
    left.pos === right.pos &&
    left.wordId === right.wordId &&
    left.posId === right.posId &&
    left.dictionaryId === right.dictionaryId &&
    left.isOov === right.isOov &&
    left.totalCost === right.totalCost &&
    sameSynonymGroupIds(left.synonymGroupIds, right.synonymGroupIds)
  );
}

function sameSynonymGroupIds(
  left: readonly number[],
  right: readonly number[],
): boolean {
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
  projection: SurfaceProjection,
  mode: TokenizeMode,
  options: InfoSubset | undefined = undefined,
): MorphemeList {
  const morphemes = getGateway(context).tokenize(
    text,
    projection,
    mode,
    options,
  );
  const attached = context.state.attach(
    context.owner,
    morphemes,
    text,
    mode,
    "owned",
  );
  rememberMorphemeProjection(attached, projection);
  attachPartOfSpeech(attached, posResolverFromContext(context));
  return attached;
}

export function tokenizeMorphemes(
  context: TokenizerExecutionContext,
  text: string,
  projection: SurfaceProjection,
  mode: TokenizeMode = "C",
  options: InfoSubset | undefined = undefined,
): MorphemeList {
  return tokenize(context, text, projection, mode, options);
}

export function lookupEntries(
  context: TokenizerExecutionContext,
  surface: string,
  projection: SurfaceProjection,
  options: InfoSubset | undefined = undefined,
): LookupEntry[] {
  return getGateway(context).lookup(surface, projection, options);
}

export function compilePosMatcher(
  context: TokenizerExecutionContext,
  patterns: PosMatcherPatterns,
): number[] {
  return getGateway(context).compilePosMatcher(patterns);
}

export function resolvePosTuple(
  context: TokenizerExecutionContext,
  posId: number,
): PosTuple | null {
  return getGateway(context).posOf?.(posId) ?? null;
}

export function parsePosTuple(value: string): PosTuple | null {
  if (value.length === 0) {
    return null;
  }

  const parts = value.split(",");
  if (parts.length !== 6) {
    return null;
  }

  const [a, b, c, d, e, f] = parts;
  if (
    a === undefined ||
    b === undefined ||
    c === undefined ||
    d === undefined ||
    e === undefined ||
    f === undefined
  ) {
    return null;
  }

  return [a, b, c, d, e, f];
}

function posResolverFromContext(
  context: TokenizerExecutionContext,
): (posId: number) => PosTuple | null {
  const owner = context.owner as {
    posOf?: (posId: number) => PosTuple | null;
  };
  if (typeof owner.posOf === "function") {
    return (posId) => owner.posOf?.(posId) ?? null;
  }

  return (posId) => resolvePosTuple(context, posId);
}

export function attachPartOfSpeech(
  morphemes: readonly Morpheme[],
  resolveByPosId: (posId: number) => PosTuple | null,
): void {
  for (const morpheme of morphemes) {
    Object.defineProperty(morpheme, "partOfSpeech", {
      value: (): PosTuple | null =>
        parsePosTuple(morpheme.pos) ?? resolveByPosId(morpheme.posId),
      writable: false,
      configurable: true,
      enumerable: false,
    });
  }
}

export function splitMorpheme(
  context: TokenizerExecutionContext,
  morpheme: Morpheme,
  projection: SurfaceProjection,
  mode: TokenizeMode = "C",
): MorphemeList {
  const morphemeState = context.state.getMorphemeState(context.owner, morpheme);
  const index = splitSourceIndex(context, projection, morpheme, morphemeState);
  const splitResult = getGateway(context).splitMorpheme(
    morphemeState.listState.text,
    morphemeState.listState.mode,
    projection,
    index,
    mode,
  );
  const attached = context.state.attach(
    context.owner,
    splitResult,
    morphemeState.listState.text,
    mode,
    "split",
  );
  rememberMorphemeProjection(attached, projection);
  attachPartOfSpeech(attached, posResolverFromContext(context));
  return attached;
}

export function splitMorphemes(
  context: TokenizerExecutionContext,
  morphemes: readonly Morpheme[],
  projection: SurfaceProjection,
  mode: TokenizeMode = "C",
): MorphemeList {
  if (morphemes.length === 0) {
    return withInternalCost([], 0);
  }

  const listState = context.state.getListState(morphemes);

  if (
    listState !== undefined &&
    context.state.canUseWholeListSplit(morphemes, listState)
  ) {
    if (listState.tokenizer !== context.owner) {
      throw new SudachiError(
        "Morpheme list was not created by this tokenizer.",
        {
          code: "INVALID_ARGUMENT",
        },
      );
    }

    const splitResult = getGateway(context).splitMorphemes(
      listState.text,
      listState.mode,
      projection,
      mode,
    );
    const attached = context.state.attach(
      context.owner,
      splitResult,
      listState.text,
      mode,
      "owned",
    );
    rememberMorphemeProjection(attached, projection);
    attachPartOfSpeech(attached, posResolverFromContext(context));
    return attached;
  }

  const results: Morpheme[] = [];
  let internalCost: number | undefined;
  let hasInternalCostMismatch = false;
  for (const morpheme of morphemes) {
    const split = splitMorpheme(context, morpheme, projection, mode);
    results.push(...split);
    if (internalCost === undefined) {
      internalCost = split.internalCost;
    } else if (split.internalCost !== internalCost) {
      hasInternalCostMismatch = true;
    }
  }

  return withInternalCost(
    results,
    hasInternalCostMismatch ? 0 : (internalCost ?? 0),
  );
}

function withInternalCost(
  morphemes: Morpheme[],
  internalCost: number,
): MorphemeList {
  Object.defineProperty(morphemes, "internalCost", {
    value: internalCost,
    writable: false,
    configurable: false,
    enumerable: false,
  });
  return morphemes as MorphemeList;
}
