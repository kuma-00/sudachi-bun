import { expect, spyOn, test } from "bun:test";

import * as core from "./core.ts";
import * as pretokenizerModule from "./pretokenizer.ts";
import * as sentenceSplitterModule from "./sentence-splitter.ts";
import { createSudachi } from "./sudachi.ts";

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

test("createSudachi returns tokenizer/splitter/pretokenizer and close()", () => {
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
    const sudachi = createSudachi({
      ...options,
      splitter: splitterOptions,
      pretokenizer: pretokenizerOptions,
    });

    expect(sudachi.tokenizer as unknown).toBe(tokenizer);
    expect(sudachi.splitter as unknown).toBe(splitter);
    expect(sudachi.pretokenizer as unknown).toBe(pretokenizer);
    expect(typeof sudachi.close).toBe("function");

    expect(createTokenizerSpy).toHaveBeenCalledWith({
      ...options,
      splitter: splitterOptions,
      pretokenizer: pretokenizerOptions,
    });
    expect(createSplitterSpy).toHaveBeenCalledWith(splitterOptions);
    expect(createPretokenizerSpy).toHaveBeenCalledWith(pretokenizerOptions);

    sudachi.close();
    expect(calls).toEqual(["pretokenizer", "splitter", "tokenizer"]);
  } finally {
    createTokenizerSpy.mockRestore();
    createSplitterSpy.mockRestore();
    createPretokenizerSpy.mockRestore();
  }
});

test("createSudachi closes already-created resources when construction fails", () => {
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
    expect(() => createSudachi({ dictPath: "/tmp/dict" })).toThrow(
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

test("close throws first close error but attempts all component closes", () => {
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
    const sudachi = createSudachi({ dictPath: "/tmp/dict" });
    expect(() => sudachi.close()).toThrow(pretokenizerError);
    expect(calls).toEqual(["pretokenizer", "splitter", "tokenizer"]);
  } finally {
    createTokenizerSpy.mockRestore();
    createSplitterSpy.mockRestore();
    createPretokenizerSpy.mockRestore();
  }
});
