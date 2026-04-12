import { expect, test } from "bun:test";

import {
  POS_MATCHER_RESULT_LAYOUT_VERSION,
  readPosMatcherResultLayout,
  readSentenceSpanResultLayout,
  SENTENCE_SPAN_RESULT_LAYOUT_VERSION,
} from "../index.ts";
import type {
  NativeSentenceSplitterLibrary,
  NativeSudachiLibrary,
} from "../types.ts";

function createPosMatcherLibrary(
  layoutWriter: (outLayout: BigUint64Array) => number = (outLayout) => {
    const values = [BigInt(POS_MATCHER_RESULT_LAYOUT_VERSION), 0n, 8n, 16n, 2n];
    values.forEach((value, index) => {
      outLayout[index] = value;
    });
    return 0;
  },
): NativeSudachiLibrary {
  return {
    symbols: {
      sudachi_create_tokenizer: () => 0,
      sudachi_free_tokenizer: () => {},
      sudachi_tokenize: () => 0,
      sudachi_tokenize_subset: () => 0,
      sudachi_split_morpheme: () => 0,
      sudachi_split_morphemes: () => 0,
      sudachi_compile_pos_matcher: () => 0,
      sudachi_free_result: () => {},
      sudachi_free_pos_matcher_result: () => {},
      sudachi_get_morpheme_result_layout: () => 0,
      sudachi_get_pos_matcher_result_layout: (outLayout) =>
        layoutWriter(outLayout as BigUint64Array),
      sudachi_get_last_error: () =>
        "native error" as unknown as import("bun:ffi").CString,
      sudachi_status_code_name: () =>
        "UNKNOWN" as unknown as import("bun:ffi").CString,
    },
    close: () => {},
  };
}

function createSentenceSplitterLibrary(
  layoutWriter: (outLayout: BigUint64Array) => number = (outLayout) => {
    const values = [
      BigInt(SENTENCE_SPAN_RESULT_LAYOUT_VERSION),
      0n,
      8n,
      16n,
      16n,
      0n,
      8n,
    ];
    values.forEach((value, index) => {
      outLayout[index] = value;
    });
    return 0;
  },
): NativeSentenceSplitterLibrary {
  return {
    symbols: {
      sudachi_create_sentence_splitter: () => 0,
      sudachi_free_sentence_splitter: () => {},
      sudachi_split_sentences: () => 0,
      sudachi_free_sentence_spans: () => {},
      sudachi_get_sentence_span_layout: (outLayout) =>
        layoutWriter(outLayout as BigUint64Array),
      sudachi_get_last_error: () =>
        "native error" as unknown as import("bun:ffi").CString,
      sudachi_status_code_name: () =>
        "UNKNOWN" as unknown as import("bun:ffi").CString,
    },
    close: () => {},
  };
}

test("readPosMatcherResultLayout maps fields in order", () => {
  expect(readPosMatcherResultLayout(createPosMatcherLibrary())).toEqual({
    layoutVersion: POS_MATCHER_RESULT_LAYOUT_VERSION,
    arrayLayoutKind: 0,
    arrayItemsOffset: 8,
    arrayLenOffset: 16,
    resultSize: 2,
  });
});

test("readPosMatcherResultLayout rejects unsupported versions", () => {
  expect(() =>
    readPosMatcherResultLayout(
      createPosMatcherLibrary((outLayout) => {
        outLayout[0] = 999n;
        return 0;
      }),
    ),
  ).toThrow("Unsupported POS matcher result layout version");
});

test("readSentenceSpanResultLayout maps fields in order", () => {
  expect(readSentenceSpanResultLayout(createSentenceSplitterLibrary())).toEqual(
    {
      layoutVersion: SENTENCE_SPAN_RESULT_LAYOUT_VERSION,
      arrayLayoutKind: 0,
      arrayItemsOffset: 8,
      arrayLenOffset: 16,
      resultSize: 16,
      startOffset: 0,
      endOffset: 8,
    },
  );
});

test("readSentenceSpanResultLayout rejects unsupported versions", () => {
  expect(() =>
    readSentenceSpanResultLayout(
      createSentenceSplitterLibrary((outLayout) => {
        outLayout[0] = 999n;
        return 0;
      }),
    ),
  ).toThrow("Unsupported sentence span result layout version");
});
