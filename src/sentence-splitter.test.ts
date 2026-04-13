import { expect, spyOn, test } from "bun:test";

import * as ffi from "./ffi.ts";
import type {
  NativeSentenceSplitterLibrary,
  SentenceSpanResultLayout,
} from "./native/types.ts";
import * as native from "./native.ts";
import {
  createSentenceSplitter,
  SentenceSplitter,
} from "./sentence-splitter.ts";

const SENTENCE_SPAN_LAYOUT: SentenceSpanResultLayout = {
  layoutVersion: 1,
  arrayLayoutKind: 0,
  arrayItemsOffset: 0,
  arrayLenOffset: 8,
  resultSize: 16,
  startOffset: 0,
  endOffset: 8,
};

function createMockLibrary(): NativeSentenceSplitterLibrary {
  return {
    symbols: {
      sudachi_create_sentence_splitter: (
        _configPath,
        _resourceDir,
        _dictPath,
        outHandle,
      ) => {
        (outHandle as BigUint64Array)[0] = 1n;
        return 0;
      },
      sudachi_free_sentence_splitter: () => {},
      sudachi_split_sentences: (_handle, _input, outResult) => {
        (outResult as BigUint64Array)[0] = 2n;
        return 0;
      },
      sudachi_get_eos: (_handle, _input, outEos, outFound) => {
        (outEos as BigUint64Array)[0] = 7n;
        (outFound as Int32Array)[0] = 1;
        return 0;
      },
      sudachi_get_eos_with_limit: (
        _handle,
        _input,
        _limit,
        outEos,
        outFound,
      ) => {
        (outEos as BigUint64Array)[0] = 7n;
        (outFound as Int32Array)[0] = 1;
        return 0;
      },
      sudachi_free_sentence_spans: () => {},
      sudachi_get_sentence_span_layout: () => 0,
      sudachi_get_last_error: () => "native error" as never,
      sudachi_status_code_name: () => "UNKNOWN" as never,
    },
    close: () => {},
  };
}

test("createSentenceSplitter returns a splitter instance", () => {
  const loadSpy = spyOn(native, "loadSentenceSplitterLibrary").mockReturnValue(
    createMockLibrary(),
  );
  const layoutSpy = spyOn(
    native,
    "readSentenceSpanResultLayout",
  ).mockReturnValue(SENTENCE_SPAN_LAYOUT);

  try {
    const splitter = createSentenceSplitter({ dictPath: "/tmp/dict" });

    expect(splitter).toBeInstanceOf(SentenceSplitter);
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(layoutSpy).toHaveBeenCalledTimes(1);
    splitter.close();
  } finally {
    loadSpy.mockRestore();
    layoutSpy.mockRestore();
  }
});

test("split returns no spans for an empty string", () => {
  const loadSpy = spyOn(native, "loadSentenceSplitterLibrary").mockReturnValue(
    createMockLibrary(),
  );
  const layoutSpy = spyOn(
    native,
    "readSentenceSpanResultLayout",
  ).mockReturnValue(SENTENCE_SPAN_LAYOUT);
  const readSpy = spyOn(ffi, "readSentenceSpanArray");
  const splitter = createSentenceSplitter({ dictPath: "/tmp/dict" });

  try {
    expect(splitter.split("")).toEqual([]);
    expect(readSpy).not.toHaveBeenCalled();
  } finally {
    splitter.close();
    readSpy.mockRestore();
    layoutSpy.mockRestore();
    loadSpy.mockRestore();
  }
});

test("split maps native UTF-8 byte spans back to text", () => {
  const library = createMockLibrary();
  const loadSpy = spyOn(native, "loadSentenceSplitterLibrary").mockReturnValue(
    library,
  );
  const layoutSpy = spyOn(
    native,
    "readSentenceSpanResultLayout",
  ).mockReturnValue(SENTENCE_SPAN_LAYOUT);
  const readSpy = spyOn(ffi, "readSentenceSpanArray").mockReturnValue([
    { start: 0, end: 7 },
    { start: 7, end: 12 },
  ]);
  const freeSpy = spyOn(library.symbols, "sudachi_free_sentence_spans");
  const splitSpy = spyOn(library.symbols, "sudachi_split_sentences");
  const splitter = createSentenceSplitter({ dictPath: "/tmp/dict" });

  try {
    expect(splitter.split("😀。 B？")).toEqual([
      { text: "😀。", start: 0, end: 7 },
      { text: " B？", start: 7, end: 12 },
    ]);
    expect(splitSpy).toHaveBeenCalledTimes(1);
    expect(splitSpy).toHaveBeenCalledWith(
      1 as never,
      "😀。 B？",
      expect.any(BigUint64Array),
    );
    expect(readSpy).toHaveBeenCalledTimes(1);
    expect(freeSpy).toHaveBeenCalledTimes(1);
  } finally {
    splitter.close();
    freeSpy.mockRestore();
    splitSpy.mockRestore();
    readSpy.mockRestore();
    layoutSpy.mockRestore();
    loadSpy.mockRestore();
  }
});

test("split rejects invalid UTF-8 byte boundaries from native", () => {
  const loadSpy = spyOn(native, "loadSentenceSplitterLibrary").mockReturnValue(
    createMockLibrary(),
  );
  const layoutSpy = spyOn(
    native,
    "readSentenceSpanResultLayout",
  ).mockReturnValue(SENTENCE_SPAN_LAYOUT);
  const readSpy = spyOn(ffi, "readSentenceSpanArray").mockReturnValue([
    { start: 1, end: 7 },
  ]);
  const splitter = createSentenceSplitter({ dictPath: "/tmp/dict" });

  try {
    expect(() => splitter.split("😀。")).toThrow(
      "does not align to a UTF-8 boundary",
    );
  } finally {
    splitter.close();
    readSpy.mockRestore();
    layoutSpy.mockRestore();
    loadSpy.mockRestore();
  }
});

test("getEos returns null for an empty string", () => {
  const loadSpy = spyOn(native, "loadSentenceSplitterLibrary").mockReturnValue(
    createMockLibrary(),
  );
  const layoutSpy = spyOn(
    native,
    "readSentenceSpanResultLayout",
  ).mockReturnValue(SENTENCE_SPAN_LAYOUT);
  const splitter = createSentenceSplitter({ dictPath: "/tmp/dict" });

  try {
    expect(splitter.getEos("")).toBeNull();
  } finally {
    splitter.close();
    layoutSpy.mockRestore();
    loadSpy.mockRestore();
  }
});

test("getEos returns byte offset from native", () => {
  const library = createMockLibrary();
  const loadSpy = spyOn(native, "loadSentenceSplitterLibrary").mockReturnValue(
    library,
  );
  const layoutSpy = spyOn(
    native,
    "readSentenceSpanResultLayout",
  ).mockReturnValue(SENTENCE_SPAN_LAYOUT);
  const eosSpy = spyOn(library.symbols, "sudachi_get_eos");
  const splitter = createSentenceSplitter({ dictPath: "/tmp/dict" });

  try {
    expect(splitter.getEos("😀。 B？")).toBe(7);
    expect(eosSpy).toHaveBeenCalledTimes(1);
    expect(eosSpy).toHaveBeenCalledWith(
      1 as never,
      "😀。 B？",
      expect.any(BigUint64Array),
      expect.any(Int32Array),
    );
  } finally {
    splitter.close();
    eosSpy.mockRestore();
    layoutSpy.mockRestore();
    loadSpy.mockRestore();
  }
});

test("getEos returns null when native reports unresolved boundary", () => {
  const library = createMockLibrary();
  const loadSpy = spyOn(native, "loadSentenceSplitterLibrary").mockReturnValue(
    library,
  );
  const layoutSpy = spyOn(
    native,
    "readSentenceSpanResultLayout",
  ).mockReturnValue(SENTENCE_SPAN_LAYOUT);
  const eosSpy = spyOn(library.symbols, "sudachi_get_eos").mockImplementation(
    (_handle, _input, outEos, outFound) => {
      (outEos as BigUint64Array)[0] = 0n;
      (outFound as Int32Array)[0] = 0;
      return 0;
    },
  );
  const splitter = createSentenceSplitter({ dictPath: "/tmp/dict" });

  try {
    expect(splitter.getEos("これはテストです")).toBeNull();
  } finally {
    splitter.close();
    eosSpy.mockRestore();
    layoutSpy.mockRestore();
    loadSpy.mockRestore();
  }
});

test("withLimit returns a detector that calls native limited API", () => {
  const library = createMockLibrary();
  const loadSpy = spyOn(native, "loadSentenceSplitterLibrary").mockReturnValue(
    library,
  );
  const layoutSpy = spyOn(
    native,
    "readSentenceSpanResultLayout",
  ).mockReturnValue(SENTENCE_SPAN_LAYOUT);
  const eosSpy = spyOn(library.symbols, "sudachi_get_eos");
  const eosWithLimitSpy = spyOn(library.symbols, "sudachi_get_eos_with_limit");
  const splitter = createSentenceSplitter({ dictPath: "/tmp/dict" });

  try {
    const limited = splitter.withLimit(4);

    expect(limited).toBeInstanceOf(SentenceSplitter);
    expect(limited.getEos("😀。 B？")).toBe(7);
    expect(splitter.getEos("😀。 B？")).toBe(7);
    expect(eosWithLimitSpy).toHaveBeenCalledTimes(1);
    expect(eosWithLimitSpy).toHaveBeenCalledWith(
      1 as never,
      "😀。 B？",
      4,
      expect.any(BigUint64Array),
      expect.any(Int32Array),
    );
    expect(eosSpy).toHaveBeenCalledTimes(1);
  } finally {
    splitter.close();
    eosWithLimitSpy.mockRestore();
    eosSpy.mockRestore();
    layoutSpy.mockRestore();
    loadSpy.mockRestore();
  }
});

test("withLimit validates positive integers", () => {
  const loadSpy = spyOn(native, "loadSentenceSplitterLibrary").mockReturnValue(
    createMockLibrary(),
  );
  const layoutSpy = spyOn(
    native,
    "readSentenceSpanResultLayout",
  ).mockReturnValue(SENTENCE_SPAN_LAYOUT);
  const splitter = createSentenceSplitter({ dictPath: "/tmp/dict" });

  try {
    expect(() => splitter.withLimit(0)).toThrow("positive integer");
    expect(() => splitter.withLimit(1.5)).toThrow("positive integer");
    expect(() => splitter.withLimit(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      "positive integer",
    );
    expect(() => splitter.withLimit(2_147_483_648)).toThrow("positive integer");
  } finally {
    splitter.close();
    layoutSpy.mockRestore();
    loadSpy.mockRestore();
  }
});

test("split/getEos/withLimit throw when splitter has been closed", () => {
  const loadSpy = spyOn(native, "loadSentenceSplitterLibrary").mockReturnValue(
    createMockLibrary(),
  );
  const layoutSpy = spyOn(
    native,
    "readSentenceSpanResultLayout",
  ).mockReturnValue(SENTENCE_SPAN_LAYOUT);
  const splitter = createSentenceSplitter({ dictPath: "/tmp/dict" });
  splitter.close();

  try {
    expect(() => splitter.split("text")).toThrow("has been closed");
    expect(() => splitter.getEos("text")).toThrow("has been closed");
    expect(() => splitter.getEos("")).toThrow("has been closed");
    expect(() => splitter.withLimit(4).getEos("text")).toThrow(
      "has been closed",
    );
  } finally {
    layoutSpy.mockRestore();
    loadSpy.mockRestore();
  }
});

test("createSentenceSplitter closes the native library when initialization fails", () => {
  const library = createMockLibrary();
  const loadSpy = spyOn(native, "loadSentenceSplitterLibrary").mockReturnValue(
    library,
  );
  const layoutSpy = spyOn(
    native,
    "readSentenceSpanResultLayout",
  ).mockReturnValue(SENTENCE_SPAN_LAYOUT);
  const createSpy = spyOn(
    library.symbols,
    "sudachi_create_sentence_splitter",
  ).mockReturnValue(7);
  const closeSpy = spyOn(library, "close");

  try {
    expect(() => createSentenceSplitter({ dictPath: "/tmp/dict" })).toThrow(
      "native error",
    );
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledTimes(1);
  } finally {
    closeSpy.mockRestore();
    createSpy.mockRestore();
    layoutSpy.mockRestore();
    loadSpy.mockRestore();
  }
});
