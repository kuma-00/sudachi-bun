import { expect, spyOn, test } from "bun:test";

import * as dictionaryModule from "./dictionary.ts";
import { createSudachi } from "./sudachi.ts";

test("createSudachi delegates to createDictionary and returns compatible object", () => {
  const options = {
    dictPath: "/tmp/dict",
    splitter: { dictPath: "/tmp/split-dict" },
    pretokenizer: { dictPath: "/tmp/pre-dict", projection: "surface" as const },
  };
  const expected = {
    tokenizer: { close() {} },
    splitter: { close() {} },
    pretokenizer: { close() {} },
    tokenize() {
      return [];
    },
    lookup() {
      return [];
    },
    createPosMatcher() {
      return {
        matches: () => false,
        filter: <T>(items: readonly T[]) => [...items],
      };
    },
    pretokenize() {
      return [];
    },
    splitSentences() {
      return [];
    },
    getEos() {
      return null;
    },
    close() {},
    [Symbol.dispose]() {},
  };
  const createDictionarySpy = spyOn(
    dictionaryModule,
    "createDictionary",
  ).mockReturnValue(expected as never);

  try {
    const sudachi = createSudachi(options);
    expect(createDictionarySpy).toHaveBeenCalledWith(options);
    expect(sudachi as unknown).toBe(expected);
    expect(sudachi.tokenizer as unknown).toBe(expected.tokenizer);
    expect(sudachi.splitter as unknown).toBe(expected.splitter);
    expect(sudachi.pretokenizer as unknown).toBe(expected.pretokenizer);
    expect(typeof sudachi.close).toBe("function");
  } finally {
    createDictionarySpy.mockRestore();
  }
});

test("createSudachi rethrows createDictionary errors", () => {
  const expected = new Error("dictionary init failed");
  const createDictionarySpy = spyOn(
    dictionaryModule,
    "createDictionary",
  ).mockImplementation(() => {
    throw expected;
  });

  try {
    expect(() => createSudachi({ dictPath: "/tmp/dict" })).toThrow(expected);
  } finally {
    createDictionarySpy.mockRestore();
  }
});
