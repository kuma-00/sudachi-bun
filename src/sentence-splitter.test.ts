import { expect, spyOn, test } from "bun:test";

import * as ffi from "./ffi.ts";
import * as native from "./native.ts";
import { SentenceSplitter, createSentenceSplitter } from "./sentence-splitter.ts";
import type { NativeSentenceSplitterLibrary, SentenceSpanResultLayout } from "./native.ts";

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
      sudachi_create_sentence_splitter: (_configPath, _resourceDir, _dictPath, outHandle) => {
        (outHandle as BigUint64Array)[0] = 1n;
        return 0;
      },
      sudachi_free_sentence_splitter: () => {},
      sudachi_split_sentences: (_handle, _input, outResult) => {
        (outResult as BigUint64Array)[0] = 2n;
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
  const loadSpy = spyOn(native, "loadSentenceSplitterLibrary").mockReturnValue(createMockLibrary());
  const layoutSpy = spyOn(native, "readSentenceSpanResultLayout").mockReturnValue(SENTENCE_SPAN_LAYOUT);

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
  const loadSpy = spyOn(native, "loadSentenceSplitterLibrary").mockReturnValue(createMockLibrary());
  const layoutSpy = spyOn(native, "readSentenceSpanResultLayout").mockReturnValue(SENTENCE_SPAN_LAYOUT);
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
  const loadSpy = spyOn(native, "loadSentenceSplitterLibrary").mockReturnValue(library);
  const layoutSpy = spyOn(native, "readSentenceSpanResultLayout").mockReturnValue(SENTENCE_SPAN_LAYOUT);
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
    expect(splitSpy).toHaveBeenCalledWith(1 as never, "😀。 B？", expect.any(BigUint64Array));
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
  const loadSpy = spyOn(native, "loadSentenceSplitterLibrary").mockReturnValue(createMockLibrary());
  const layoutSpy = spyOn(native, "readSentenceSpanResultLayout").mockReturnValue(SENTENCE_SPAN_LAYOUT);
  const readSpy = spyOn(ffi, "readSentenceSpanArray").mockReturnValue([{ start: 1, end: 7 }]);
  const splitter = createSentenceSplitter({ dictPath: "/tmp/dict" });

  try {
    expect(() => splitter.split("😀。")).toThrow("does not align to a UTF-8 boundary");
  } finally {
    splitter.close();
    readSpy.mockRestore();
    layoutSpy.mockRestore();
    loadSpy.mockRestore();
  }
});

test("createSentenceSplitter closes the native library when initialization fails", () => {
  const library = createMockLibrary();
  const loadSpy = spyOn(native, "loadSentenceSplitterLibrary").mockReturnValue(library);
  const layoutSpy = spyOn(native, "readSentenceSpanResultLayout").mockReturnValue(SENTENCE_SPAN_LAYOUT);
  const createSpy = spyOn(library.symbols, "sudachi_create_sentence_splitter").mockReturnValue(7);
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
