import { expect, spyOn, test } from "bun:test";

import * as core from "./core.ts";
import * as dictionaryModule from "./dictionary.ts";
import * as pretokenizerModule from "./pretokenizer.ts";
import * as sentenceSplitterModule from "./sentence-splitter.ts";
import * as sudachiModule from "./sudachi.ts";

type DictionaryLike = {
  tokenizer: { close(): void };
  splitter: { close(): void };
  pretokenizer: { close(): void };
  close(): void;
  [Symbol.dispose](): void;
};

function createCloseable(name: string, calls: string[], error?: Error) {
  return {
    name,
    close() {
      calls.push(name);
      if (error) {
        throw error;
      }
    },
  };
}

function resolveCreateDictionary(): (options: unknown) => DictionaryLike {
  const fromDictionary = (
    dictionaryModule as unknown as Record<string, unknown>
  ).createDictionary;
  if (typeof fromDictionary === "function") {
    return fromDictionary as (options: unknown) => DictionaryLike;
  }

  const fromSudachi = (sudachiModule as unknown as Record<string, unknown>)
    .createDictionary;
  if (typeof fromSudachi === "function") {
    return fromSudachi as (options: unknown) => DictionaryLike;
  }

  throw new Error("createDictionary is not exported");
}

test("createDictionary returns tokenizer/splitter/pretokenizer and closes in reverse order", () => {
  const calls: string[] = [];
  const tokenizer = createCloseable("tokenizer", calls);
  const splitter = createCloseable("splitter", calls);
  const pretokenizer = createCloseable("pretokenizer", calls);
  const options = { dictPath: "/tmp/dict", debug: true };
  const splitterOptions = { dictPath: "/tmp/split-dict", debug: false };
  const pretokenizerOptions = {
    dictPath: "/tmp/pre-dict",
    projection: "normalized" as const,
  };
  const createTokenizerSpy = spyOn(core, "createTokenizer").mockReturnValue(
    tokenizer as never,
  );
  const createSplitterSpy = spyOn(
    sentenceSplitterModule,
    "createSentenceSplitter",
  ).mockReturnValue(splitter as never);
  const createPretokenizerSpy = spyOn(
    pretokenizerModule,
    "createPretokenizer",
  ).mockReturnValue(pretokenizer as never);

  try {
    const createDictionary = resolveCreateDictionary();
    const dictionary = createDictionary({
      ...options,
      splitter: splitterOptions,
      pretokenizer: pretokenizerOptions,
    });

    expect(dictionary.tokenizer as unknown).toBe(tokenizer);
    expect(dictionary.splitter as unknown).toBe(splitter);
    expect(dictionary.pretokenizer as unknown).toBe(pretokenizer);
    expect(typeof dictionary.close).toBe("function");

    expect(createTokenizerSpy).toHaveBeenCalledWith({
      ...options,
      splitter: splitterOptions,
      pretokenizer: pretokenizerOptions,
    });
    expect(createSplitterSpy).toHaveBeenCalledWith(splitterOptions);
    expect(createPretokenizerSpy).toHaveBeenCalledWith(pretokenizerOptions);

    dictionary.close();
    expect(calls).toEqual(["pretokenizer", "splitter", "tokenizer"]);
  } finally {
    createTokenizerSpy.mockRestore();
    createSplitterSpy.mockRestore();
    createPretokenizerSpy.mockRestore();
  }
});

test("createDictionary closes already-created resources when construction fails", () => {
  const calls: string[] = [];
  const tokenizer = createCloseable("tokenizer", calls);
  const splitter = createCloseable("splitter", calls);
  const constructionError = new Error("pretokenizer init failed");
  const createTokenizerSpy = spyOn(core, "createTokenizer").mockReturnValue(
    tokenizer as never,
  );
  const createSplitterSpy = spyOn(
    sentenceSplitterModule,
    "createSentenceSplitter",
  ).mockReturnValue(splitter as never);
  const createPretokenizerSpy = spyOn(
    pretokenizerModule,
    "createPretokenizer",
  ).mockImplementation(() => {
    throw constructionError;
  });

  try {
    const createDictionary = resolveCreateDictionary();
    expect(() => createDictionary({ dictPath: "/tmp/dict" })).toThrow(
      constructionError,
    );
    expect(calls).toEqual(["splitter", "tokenizer"]);
    expect(createTokenizerSpy).toHaveBeenCalledTimes(1);
    expect(createSplitterSpy).toHaveBeenCalledTimes(1);
    expect(createPretokenizerSpy).toHaveBeenCalledTimes(1);
  } finally {
    createTokenizerSpy.mockRestore();
    createSplitterSpy.mockRestore();
    createPretokenizerSpy.mockRestore();
  }
});

test("createDictionary close throws first close error but attempts all component closes", () => {
  const calls: string[] = [];
  const pretokenizerError = new Error("pretokenizer close failed");
  const splitterError = new Error("splitter close failed");
  const tokenizer = createCloseable("tokenizer", calls);
  const splitter = createCloseable("splitter", calls, splitterError);
  const pretokenizer = createCloseable(
    "pretokenizer",
    calls,
    pretokenizerError,
  );
  const createTokenizerSpy = spyOn(core, "createTokenizer").mockReturnValue(
    tokenizer as never,
  );
  const createSplitterSpy = spyOn(
    sentenceSplitterModule,
    "createSentenceSplitter",
  ).mockReturnValue(splitter as never);
  const createPretokenizerSpy = spyOn(
    pretokenizerModule,
    "createPretokenizer",
  ).mockReturnValue(pretokenizer as never);

  try {
    const createDictionary = resolveCreateDictionary();
    const dictionary = createDictionary({ dictPath: "/tmp/dict" });
    expect(() => dictionary.close()).toThrow(pretokenizerError);
    expect(calls).toEqual(["pretokenizer", "splitter", "tokenizer"]);
  } finally {
    createTokenizerSpy.mockRestore();
    createSplitterSpy.mockRestore();
    createPretokenizerSpy.mockRestore();
  }
});
