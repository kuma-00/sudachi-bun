import { expect, test } from "bun:test";

import { createHuggingFacePretokenizer } from "../index.ts";
import type { InfoSubsetField, PretokenizedToken } from "./types.ts";

type HfNormalizedStringMock = {
  toString(): string;
  slice(begin: number, end: number): HfNormalizedStringMock;
};

type HfPreTokenizedStringMock = {
  split(
    callback: (
      index: number,
      normalized: HfNormalizedStringMock,
    ) => HfNormalizedStringMock[],
  ): void;
};

function createNormalizedStringMock(text: string): HfNormalizedStringMock {
  return {
    toString() {
      return text;
    },
    slice(begin: number, end: number) {
      return createNormalizedStringMock(text.slice(begin, end));
    },
  };
}

function createToken(
  text: string,
  beginChar: number,
  endChar: number,
  surface?: string,
): PretokenizedToken {
  return {
    surface: surface ?? text.slice(beginChar, endChar),
    headWordLength: endChar - beginChar,
    normalized: text.slice(beginChar, endChar),
    dictionaryForm: text.slice(beginChar, endChar),
    reading: text.slice(beginChar, endChar),
    pos: "名詞",
    beginByte: beginChar,
    endByte: endChar,
    beginChar,
    endChar,
    wordId: `${beginChar}-${endChar}`,
    posId: 0,
    dictionaryId: 0,
    isOov: false,
    splitA: [],
    splitB: [],
    wordStructure: [],
    synonymGroupIds: [],
  };
}

test("createHuggingFacePretokenizer handler can transform token sequence and all entrypoints share conversion semantics", () => {
  const sourceText = "東京都";
  const pretokenizer = {
    pretokenize(text: string) {
      return [createToken(text, 0, 2), createToken(text, 2, 3)];
    },
  };

  const options = {
    projection: "surface",
    handler(tokens: PretokenizedToken[]) {
      return [
        {
          ...tokens[1],
          surface: `[${tokens[1]?.surface}]`,
        },
        {
          ...tokens[0],
          surface: `[${tokens[0]?.surface}]`,
        },
      ];
    },
  };

  const adapter = createHuggingFacePretokenizer(
    pretokenizer as never,
    options as never,
  );

  const preTokenizeStr = adapter.pre_tokenize_str(sourceText);
  const preTokenizeText = adapter.pre_tokenize_text(sourceText);

  expect(preTokenizeStr).toEqual([
    ["[都]", [2, 3]],
    ["[東京]", [0, 2]],
  ]);
  expect(preTokenizeText).toEqual(preTokenizeStr);

  const splitResult: string[] = [];
  adapter.pre_tokenize({
    split(
      callback: (
        index: number,
        normalized: HfNormalizedStringMock,
      ) => HfNormalizedStringMock[],
    ) {
      const chunks = callback(0, createNormalizedStringMock(sourceText));
      splitResult.splice(0, splitResult.length, ...chunks.map(String));
    },
  } as HfPreTokenizedStringMock);

  expect(splitResult).toEqual(["都", "東京"]);
  expect(
    preTokenizeStr.map(([, [begin, end]]) => sourceText.slice(begin, end)),
  ).toEqual(splitResult);
});

test("createHuggingFacePretokenizer wraps handler exceptions with user-facing context", () => {
  const pretokenizer = {
    pretokenize(text: string) {
      return [createToken(text, 0, text.length)];
    },
  };

  const adapter = createHuggingFacePretokenizer(
    pretokenizer as never,
    {
      projection: "surface",
      handler() {
        throw new Error("boom");
      },
    } as never,
  );

  expect(() => adapter.pre_tokenize_str("東京")).toThrow(/pre_tokenize_str/i);
  expect(() => adapter.pre_tokenize_str("東京")).toThrow(/handler/i);

  expect(() => adapter.pre_tokenize_text("東京")).toThrow(/pre_tokenize_text/i);
  expect(() => adapter.pre_tokenize_text("東京")).toThrow(/handler/i);

  expect(() =>
    adapter.pre_tokenize({
      split(
        callback: (
          index: number,
          normalized: HfNormalizedStringMock,
        ) => HfNormalizedStringMock[],
      ) {
        callback(0, createNormalizedStringMock("東京"));
      },
    } as HfPreTokenizedStringMock),
  ).toThrow(/pre_tokenize/i);
  expect(() =>
    adapter.pre_tokenize({
      split(
        callback: (
          index: number,
          normalized: HfNormalizedStringMock,
        ) => HfNormalizedStringMock[],
      ) {
        callback(0, createNormalizedStringMock("東京"));
      },
    } as HfPreTokenizedStringMock),
  ).toThrow(/handler/i);
});

test("createHuggingFacePretokenizer forwards options, preserves projected token surfaces, and rejects non-surface projection in the pipeline path", () => {
  const calls: Array<{ text: string; options: unknown }> = [];
  const options = {
    debug: true,
    mode: "C",
    projection: "reading",
  } as const;
  const pretokenizer = {
    pretokenize(text: string, options?: unknown) {
      calls.push({ text, options });
      return [
        {
          ...createToken(text, 0, text.length),
          surface: text === "東京" ? "とうきょう" : "きょうと",
        },
      ];
    },
  };

  const adapter = createHuggingFacePretokenizer(pretokenizer as never, options);

  expect(adapter.options).toBe(options);
  expect(adapter.pre_tokenize_str("東京")).toEqual([
    ["とうきょう", [0, "東京".length]],
  ]);
  expect(adapter.pre_tokenize_text("京都")).toEqual([
    ["きょうと", [0, "京都".length]],
  ]);

  let splitCalled = false;
  expect(() =>
    adapter.pre_tokenize({
      split(
        callback: (
          index: number,
          normalized: HfNormalizedStringMock,
        ) => HfNormalizedStringMock[],
      ) {
        splitCalled = true;
        const normalized = createNormalizedStringMock("東京");
        callback(0, normalized);
      },
    } as HfPreTokenizedStringMock),
  ).toThrow(
    "HuggingFace pre_tokenize(pretok) only supports surface projection.",
  );
  expect(splitCalled).toBe(false);
  expect(calls).toEqual([
    {
      text: "東京",
      options,
    },
    {
      text: "京都",
      options,
    },
  ]);
});

test("createHuggingFacePretokenizer behavior remains unchanged without handler", () => {
  const calls: Array<{ text: string; options: unknown }> = [];
  const pretokenizer = {
    pretokenize(text: string, options?: unknown) {
      calls.push({ text, options });
      return [createToken(text, 0, text.length)];
    },
  };

  const adapter = createHuggingFacePretokenizer(pretokenizer as never);

  const splitResult: string[] = [];
  adapter.pre_tokenize({
    split(
      callback: (
        index: number,
        normalized: HfNormalizedStringMock,
      ) => HfNormalizedStringMock[],
    ) {
      const normalized = createNormalizedStringMock("東京");
      splitResult.splice(
        0,
        splitResult.length,
        ...callback(0, normalized).map(String),
      );
    },
  } as HfPreTokenizedStringMock);

  expect(adapter.pre_tokenize_str("東京")).toEqual([["東京", [0, 2]]]);
  expect(adapter.pre_tokenize_text("東京")).toEqual([["東京", [0, 2]]]);
  expect(splitResult).toEqual(["東京"]);
  expect(calls).toEqual([
    {
      text: "東京",
      options: {
        projection: "surface",
      },
    },
    {
      text: "東京",
      options: {
        projection: "surface",
      },
    },
    {
      text: "東京",
      options: {
        projection: "surface",
      },
    },
  ]);
});

test("createHuggingFacePretokenizer adds surface to subset fields without mutating caller options", () => {
  const calls: Array<{ text: string; options: unknown }> = [];
  const fields: InfoSubsetField[] = ["pos"];
  const options = {
    subset: { fields },
  };
  const pretokenizer = {
    pretokenize(text: string, options?: unknown) {
      calls.push({ text, options });
      return [
        {
          ...createToken(text, 0, text.length),
          surface: text === "東京" ? "とうきょう" : "きょうと",
        },
      ];
    },
  };

  const adapter = createHuggingFacePretokenizer(pretokenizer as never, options);

  expect(adapter.options).toBe(options);
  expect(adapter.pre_tokenize_str("東京")).toEqual([
    ["とうきょう", [0, "東京".length]],
  ]);

  expect(fields).toEqual(["pos"]);
  expect(calls).toHaveLength(1);

  const call = calls[0];
  expect(call).toBeDefined();
  if (call) {
    expect(call.text).toBe("東京");
    expect(call.options).not.toBe(options);

    const pretokenizeOptions = call.options as {
      subset?: { fields?: string[] };
    };
    expect(pretokenizeOptions.subset).not.toBe(options.subset);
    expect(pretokenizeOptions.subset?.fields).toEqual(["pos", "surface"]);
  }
});
