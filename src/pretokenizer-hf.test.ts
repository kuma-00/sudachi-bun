import { expect, test } from "bun:test";

import { createHuggingFacePretokenizer } from "../index.ts";
import type { InfoSubsetField } from "./types.ts";

type HfNormalizedStringMock = {
  toString(): string;
  slice(begin: number, end: number): HfNormalizedStringMock;
};

type HfPreTokenizedStringMock = {
  split(
    callback: (index: number, normalized: HfNormalizedStringMock) => HfNormalizedStringMock[],
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
          surface: text === "東京" ? "とうきょう" : "きょうと",
          beginByte: 0,
          endByte: Buffer.byteLength(text, "utf8"),
          beginChar: 0,
          endChar: text.length,
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
      split(callback: (index: number, normalized: HfNormalizedStringMock) => HfNormalizedStringMock[]) {
        splitCalled = true;
        const normalized = createNormalizedStringMock("東京");
        callback(0, normalized);
      },
    } as HfPreTokenizedStringMock),
  ).toThrow("HuggingFace pre_tokenize(pretok) only supports surface projection.");
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

test("createHuggingFacePretokenizer pre_tokenize uses the PreTokenizedString split pipeline", () => {
  const calls: Array<{ text: string; options: unknown }> = [];
  const pretokenizer = {
    pretokenize(text: string, options?: unknown) {
      calls.push({ text, options });
      return [
        {
          surface: text === "東京" ? "とうきょう" : "きょうと",
          beginByte: 0,
          endByte: Buffer.byteLength(text, "utf8"),
          beginChar: 0,
          endChar: text.length,
        },
      ];
    },
  };

  const adapter = createHuggingFacePretokenizer(pretokenizer as never, {
    projection: "surface",
  });

  let splitResult: string[] | null = null;
  const splitCalls: number[] = [];
  adapter.pre_tokenize({
    split(callback: (index: number, normalized: HfNormalizedStringMock) => HfNormalizedStringMock[]) {
      splitCalls.push(1);
      const normalized = createNormalizedStringMock("東京");
      splitResult = callback(0, normalized).map(String);
    },
  } as HfPreTokenizedStringMock);

  expect(splitCalls).toEqual([1]);
  expect((splitResult ?? []) as string[]).toEqual(["東京"]);
  expect(calls).toEqual([
    {
      text: "東京",
      options: {
        projection: "surface",
      },
    },
  ]);
});

test("createHuggingFacePretokenizer defaults adapter calls to surface projection", () => {
  const calls: Array<{ text: string; options: unknown }> = [];
  const pretokenizer = {
    pretokenize(text: string, options?: unknown) {
      calls.push({ text, options });
      return [
        {
          surface: text,
          beginByte: 0,
          endByte: Buffer.byteLength(text, "utf8"),
          beginChar: 0,
          endChar: text.length,
        },
      ];
    },
  };

  const adapter = createHuggingFacePretokenizer(pretokenizer as never);

  let splitResult: string[] | null = null;
  adapter.pre_tokenize({
    split(callback: (index: number, normalized: HfNormalizedStringMock) => HfNormalizedStringMock[]) {
      const normalized = createNormalizedStringMock("東京");
      splitResult = callback(0, normalized).map(String);
    },
  } as HfPreTokenizedStringMock);

  expect((splitResult ?? []) as string[]).toEqual(["東京"]);
  expect(calls).toEqual([
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
          surface: text === "東京" ? "とうきょう" : "きょうと",
          beginByte: 0,
          endByte: Buffer.byteLength(text, "utf8"),
          beginChar: 0,
          endChar: text.length,
          normalized: text,
          dictionaryForm: text,
          reading: text,
          pos: "名詞",
          wordId: "0",
          posId: 0,
          dictionaryId: 0,
          isOov: false,
          synonymGroupIds: [],
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
