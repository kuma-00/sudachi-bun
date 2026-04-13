import { expect, spyOn, test } from "bun:test";

import type { Morpheme, MorphemeList } from "../types.ts";
import { MorphemeStateTracker } from "./morpheme-state.ts";
import {
  splitMorpheme,
  splitMorphemes,
  tokenizeMorphemes,
} from "./operations.ts";
import type { TokenizerGateway, TokenizerSessionManager } from "./session.ts";

function createMorpheme(surface: string, begin: number, end: number): Morpheme {
  return {
    surface,
    normalized: surface,
    dictionaryForm: surface,
    reading: surface,
    pos: "名詞,普通名詞,一般,*,*,*",
    begin,
    end,
    beginChar: begin,
    endChar: end,
    wordId: `${surface}-${begin}`,
    posId: 0,
    dictionaryId: 0,
    isOov: false,
    totalCost: 0,
    synonymGroupIds: [],
  };
}

function createMorphemeList(
  morphemes: Morpheme[],
  internalCost: number,
): MorphemeList {
  return Object.assign(morphemes, { internalCost });
}

function createContext(gateway: TokenizerGateway): {
  owner: object;
  session: TokenizerSessionManager;
  state: MorphemeStateTracker;
} {
  return {
    owner: {},
    session: {
      getGateway: () => gateway,
    } as unknown as TokenizerSessionManager,
    state: new MorphemeStateTracker(),
  };
}

function requireDefined<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`${label} is undefined`);
  }

  return value;
}

test("tokenize attaches state and fallback split keeps remembered source projection", () => {
  const gateway: TokenizerGateway = {
    tokenize: (_text, projection) => {
      if (projection === "dictionary_form") {
        return createMorphemeList([createMorpheme("東京都", 0, 9)], 0);
      }

      return createMorphemeList(
        [createMorpheme("東京", 0, 6), createMorpheme("都", 6, 9)],
        0,
      );
    },
    lookup: () => [],
    compilePosMatcher: () => [],
    splitMorpheme: (_text, _sourceMode, _projection, sourceIndex) => {
      if (sourceIndex === 0) {
        return createMorphemeList(
          [createMorpheme("東京", 0, 6), createMorpheme("都", 6, 9)],
          0,
        );
      }

      return createMorphemeList([createMorpheme("都", 6, 9)], 0);
    },
    splitMorphemes: () => createMorphemeList([], 0),
  };

  const tokenizeSpy = spyOn(gateway, "tokenize");
  const splitMorphemeSpy = spyOn(gateway, "splitMorpheme");
  const context = createContext(gateway);

  const tokenized = tokenizeMorphemes(
    context,
    "東京都",
    "dictionary_form",
    "C",
  );
  const firstSplit = splitMorpheme(
    context,
    requireDefined(tokenized[0], "tokenized[0]"),
    "reading",
    "A",
  );
  const secondSplit = splitMorpheme(
    context,
    requireDefined(firstSplit[0], "firstSplit[0]"),
    "surface",
    "A",
  );

  expect(context.state.getListState(tokenized)?.kind).toBe("owned");
  expect(context.state.getListState(firstSplit)?.kind).toBe("split");
  expect(secondSplit.length).toBeGreaterThan(0);

  expect(tokenizeSpy).toHaveBeenCalledTimes(2);
  expect(tokenizeSpy.mock.calls[0]).toEqual([
    "東京都",
    "dictionary_form",
    "C",
    undefined,
  ]);
  expect(tokenizeSpy.mock.calls[1]).toEqual([
    "東京都",
    "reading",
    "A",
    undefined,
  ]);

  expect(splitMorphemeSpy).toHaveBeenCalledTimes(2);
  expect(splitMorphemeSpy.mock.calls[0]).toEqual([
    "東京都",
    "C",
    "reading",
    0,
    "A",
  ]);
  expect(splitMorphemeSpy.mock.calls[1]).toEqual([
    "東京都",
    "A",
    "surface",
    0,
    "A",
  ]);
});

test("splitMorphemes uses whole-list split for owned lists", () => {
  const gateway: TokenizerGateway = {
    tokenize: () => createMorphemeList([createMorpheme("東京都", 0, 9)], 0),
    lookup: () => [],
    compilePosMatcher: () => [],
    splitMorpheme: () => createMorphemeList([createMorpheme("東京", 0, 6)], 0),
    splitMorphemes: () =>
      createMorphemeList(
        [createMorpheme("東京", 0, 6), createMorpheme("都", 6, 9)],
        0,
      ),
  };

  const splitMorphemeSpy = spyOn(gateway, "splitMorpheme");
  const splitMorphemesSpy = spyOn(gateway, "splitMorphemes");
  const context = createContext(gateway);

  const tokenized = tokenizeMorphemes(context, "東京都", "surface", "C");
  const splitResult = splitMorphemes(context, tokenized, "surface", "A");

  expect(splitResult).toHaveLength(2);
  expect(splitMorphemesSpy).toHaveBeenCalledTimes(1);
  expect(splitMorphemesSpy).toHaveBeenCalledWith("東京都", "C", "surface", "A");
  expect(splitMorphemeSpy).toHaveBeenCalledTimes(0);
  expect(context.state.getListState(splitResult)?.kind).toBe("owned");
});

test("splitMorphemes falls back to per-morpheme splitting for non-owned lists", () => {
  const gateway: TokenizerGateway = {
    tokenize: (_text, projection) => {
      if (projection === "surface") {
        return createMorphemeList([createMorpheme("東京都", 0, 9)], 0);
      }

      return createMorphemeList(
        [createMorpheme("東京", 0, 6), createMorpheme("都", 6, 9)],
        0,
      );
    },
    lookup: () => [],
    compilePosMatcher: () => [],
    splitMorpheme: (
      _sourceText,
      _sourceMode,
      _projection,
      sourceIndex,
      _splitMode,
    ) => {
      if (sourceIndex === 0) {
        return createMorphemeList(
          [createMorpheme("東京", 0, 6), createMorpheme("都", 6, 9)],
          0,
        );
      }

      return createMorphemeList([createMorpheme("都", 6, 9)], 0);
    },
    splitMorphemes: () =>
      createMorphemeList([createMorpheme("SHOULD_NOT_BE_USED", 0, 1)], 0),
  };

  const tokenizeSpy = spyOn(gateway, "tokenize");
  const splitMorphemeSpy = spyOn(gateway, "splitMorpheme");
  const splitMorphemesSpy = spyOn(gateway, "splitMorphemes");
  const context = createContext(gateway);

  const tokenized = tokenizeMorphemes(context, "東京都", "surface", "C");
  const splitList = splitMorpheme(
    context,
    requireDefined(tokenized[0], "tokenized[0]"),
    "reading",
    "A",
  );
  const splitAgain = splitMorphemes(context, splitList, "normalized", "A");

  expect(splitAgain.length).toBeGreaterThan(0);
  expect(context.state.getListState(splitList)?.kind).toBe("split");

  expect(splitMorphemesSpy).toHaveBeenCalledTimes(0);
  expect(splitMorphemeSpy).toHaveBeenCalledTimes(3);
  expect(tokenizeSpy).toHaveBeenCalledTimes(3);

  const fallbackCalls = tokenizeSpy.mock.calls.slice(1);
  expect(fallbackCalls[0]).toEqual(["東京都", "reading", "A", undefined]);
  expect(fallbackCalls[1]).toEqual(["東京都", "reading", "A", undefined]);
});

test("splitMorphemes fallback preserves a shared internalCost", () => {
  const gateway: TokenizerGateway = {
    tokenize: (_text, projection) => {
      if (projection === "surface") {
        return createMorphemeList([createMorpheme("東京都", 0, 9)], 0);
      }

      return createMorphemeList(
        [createMorpheme("東京", 0, 6), createMorpheme("都", 6, 9)],
        0,
      );
    },
    lookup: () => [],
    compilePosMatcher: () => [],
    splitMorpheme: (
      _sourceText,
      _sourceMode,
      projection,
      sourceIndex,
      _splitMode,
    ) => {
      if (projection === "reading" && sourceIndex === 0) {
        return createMorphemeList(
          [createMorpheme("東京", 0, 6), createMorpheme("都", 6, 9)],
          5,
        );
      }

      if (sourceIndex === 0) {
        return createMorphemeList([createMorpheme("東京", 0, 6)], 17);
      }

      return createMorphemeList([createMorpheme("都", 6, 9)], 17);
    },
    splitMorphemes: () =>
      createMorphemeList([createMorpheme("SHOULD_NOT_BE_USED", 0, 1)], 0),
  };

  const context = createContext(gateway);

  const tokenized = tokenizeMorphemes(context, "東京都", "surface", "C");
  const splitList = splitMorpheme(
    context,
    requireDefined(tokenized[0], "tokenized[0]"),
    "reading",
    "A",
  );
  const splitAgain = splitMorphemes(context, splitList, "normalized", "A");

  expect(splitAgain.internalCost).toBe(17);
});

test("splitMorphemes fallback clears internalCost when splits disagree", () => {
  const gateway: TokenizerGateway = {
    tokenize: (_text, projection) => {
      if (projection === "surface") {
        return createMorphemeList([createMorpheme("東京都", 0, 9)], 0);
      }

      return createMorphemeList(
        [createMorpheme("東京", 0, 6), createMorpheme("都", 6, 9)],
        0,
      );
    },
    lookup: () => [],
    compilePosMatcher: () => [],
    splitMorpheme: (
      _sourceText,
      _sourceMode,
      projection,
      sourceIndex,
      _splitMode,
    ) => {
      if (projection === "reading" && sourceIndex === 0) {
        return createMorphemeList(
          [createMorpheme("東京", 0, 6), createMorpheme("都", 6, 9)],
          5,
        );
      }

      if (sourceIndex === 0) {
        return createMorphemeList([createMorpheme("東京", 0, 6)], 11);
      }

      return createMorphemeList([createMorpheme("都", 6, 9)], 22);
    },
    splitMorphemes: () =>
      createMorphemeList([createMorpheme("SHOULD_NOT_BE_USED", 0, 1)], 0),
  };

  const context = createContext(gateway);

  const tokenized = tokenizeMorphemes(context, "東京都", "surface", "C");
  const splitList = splitMorpheme(
    context,
    requireDefined(tokenized[0], "tokenized[0]"),
    "reading",
    "A",
  );

  const splitAgain = splitMorphemes(context, splitList, "normalized", "A");
  const reversed = splitMorphemes(
    context,
    [...splitList].reverse(),
    "normalized",
    "A",
  );

  expect(splitAgain.internalCost).toBe(0);
  expect(reversed.internalCost).toBe(0);
});
