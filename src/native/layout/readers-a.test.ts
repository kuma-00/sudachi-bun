import { expect, test } from "bun:test";

import type {
  NativeLookupLibrary,
  NativePretokenizerLibrary,
  NativeSudachiLibrary,
} from "../types.ts";
import {
  LOOKUP_RESULT_LAYOUT_VERSION,
  readLookupResultLayout,
} from "./lookup.ts";
import {
  MORPHEME_RESULT_LAYOUT_VERSION,
  readMorphemeResultLayout,
} from "./morpheme.ts";
import {
  PRETOKENIZED_RESULT_LAYOUT_VERSION,
  readPretokenizedResultLayout,
} from "./pretokenized.ts";

function writeLayout(
  outLayout: BigUint64Array,
  values: readonly bigint[],
): number {
  values.forEach((value, index) => {
    outLayout[index] = value;
  });
  return 0;
}

function createMorphemeLibrary(
  layoutWriter: (outLayout: BigUint64Array) => number = (outLayout) =>
    writeLayout(outLayout, [
      BigInt(MORPHEME_RESULT_LAYOUT_VERSION),
      0n,
      8n,
      16n,
      112n,
      0n,
      8n,
      16n,
      24n,
      32n,
      40n,
      48n,
      56n,
      64n,
      72n,
      80n,
      84n,
      88n,
      96n,
      104n,
    ]),
): NativeSudachiLibrary {
  return {
    symbols: {
      sudachi_create_tokenizer: () => 0,
      sudachi_free_tokenizer: () => {},
      sudachi_create_stateful_tokenizer_from_tokenizer: () => 0,
      sudachi_free_stateful_tokenizer: () => {},
      sudachi_stateful_tokenizer_reset: () => 0,
      sudachi_stateful_tokenizer_set_mode: () => 0,
      sudachi_stateful_tokenizer_set_subset: () => 0,
      sudachi_stateful_tokenizer_do_tokenize: () => 0,
      sudachi_tokenize: () => 0,
      sudachi_tokenize_subset: () => 0,
      sudachi_split_morpheme: () => 0,
      sudachi_split_morphemes: () => 0,
      sudachi_compile_pos_matcher: () => 0,
      sudachi_free_result: () => {},
      sudachi_free_pos_matcher_result: () => {},
      sudachi_get_morpheme_result_layout: (outLayout) =>
        layoutWriter(outLayout as BigUint64Array),
      sudachi_get_pos_matcher_result_layout: () => 0,
      sudachi_get_last_error: () =>
        "native error" as unknown as import("bun:ffi").CString,
      sudachi_status_code_name: () =>
        "UNKNOWN" as unknown as import("bun:ffi").CString,
    },
    close: () => {},
  };
}

function createLookupLibrary(
  layoutWriter: (outLayout: BigUint64Array) => number = (outLayout) =>
    writeLayout(outLayout, [
      BigInt(LOOKUP_RESULT_LAYOUT_VERSION),
      0n,
      8n,
      16n,
      40n,
      0n,
      8n,
      16n,
      24n,
      28n,
      32n,
    ]),
): NativeLookupLibrary {
  return {
    symbols: {
      sudachi_lookup: () => 0,
      sudachi_lookup_subset: () => 0,
      sudachi_free_lookup_result: () => {},
      sudachi_get_lookup_result_layout: (outLayout) =>
        layoutWriter(outLayout as BigUint64Array),
      sudachi_get_last_error: () =>
        "native error" as unknown as import("bun:ffi").CString,
      sudachi_status_code_name: () =>
        "UNKNOWN" as unknown as import("bun:ffi").CString,
    },
    close: () => {},
  };
}

function createPretokenizerLibrary(
  layoutWriter: (outLayout: BigUint64Array) => number = (outLayout) =>
    writeLayout(outLayout, [
      BigInt(PRETOKENIZED_RESULT_LAYOUT_VERSION),
      0n,
      8n,
      16n,
      128n,
      0n,
      8n,
      16n,
      24n,
      32n,
      40n,
      48n,
      56n,
      64n,
      72n,
      80n,
      84n,
      88n,
      96n,
      104n,
    ]),
): NativePretokenizerLibrary {
  return {
    symbols: {
      sudachi_create_pretokenizer: () => 0,
      sudachi_free_pretokenizer: () => {},
      sudachi_pretokenize: () => 0,
      sudachi_pretokenize_subset: () => 0,
      sudachi_free_pretokenized_result: () => {},
      sudachi_get_pretokenized_result_layout: (outLayout) =>
        layoutWriter(outLayout as BigUint64Array),
      sudachi_get_last_error: () =>
        "native error" as unknown as import("bun:ffi").CString,
      sudachi_status_code_name: () =>
        "UNKNOWN" as unknown as import("bun:ffi").CString,
    },
    close: () => {},
  };
}

test("readMorphemeResultLayout maps fields in order", () => {
  expect(readMorphemeResultLayout(createMorphemeLibrary())).toEqual({
    layoutVersion: MORPHEME_RESULT_LAYOUT_VERSION,
    arrayLayoutKind: 0,
    arrayItemsOffset: 8,
    arrayLenOffset: 16,
    resultSize: 112,
    surfaceOffset: 0,
    normalizedOffset: 8,
    dictionaryFormOffset: 16,
    readingOffset: 24,
    posOffset: 32,
    beginOffset: 40,
    endOffset: 48,
    beginCharOffset: 56,
    endCharOffset: 64,
    wordIdOffset: 72,
    posIdOffset: 80,
    dictionaryIdOffset: 84,
    isOovOffset: 88,
    synonymGroupIdsOffset: 96,
    synonymGroupIdsLenOffset: 104,
  });
});

test("readMorphemeResultLayout rejects unsupported layout versions", () => {
  expect(() =>
    readMorphemeResultLayout(
      createMorphemeLibrary((outLayout) => {
        outLayout[0] = 999n;
        return 0;
      }),
    ),
  ).toThrow("Unsupported morpheme result layout version");
});

test("readLookupResultLayout maps fields in order", () => {
  expect(readLookupResultLayout(createLookupLibrary())).toEqual({
    layoutVersion: LOOKUP_RESULT_LAYOUT_VERSION,
    arrayLayoutKind: 0,
    arrayItemsOffset: 8,
    arrayLenOffset: 16,
    resultSize: 40,
    surfaceOffset: 0,
    posOffset: 8,
    wordIdOffset: 16,
    posIdOffset: 24,
    dictionaryIdOffset: 28,
    isOovOffset: 32,
  });
});

test("readLookupResultLayout rejects unsupported layout versions", () => {
  expect(() =>
    readLookupResultLayout(
      createLookupLibrary((outLayout) => {
        outLayout[0] = 999n;
        return 0;
      }),
    ),
  ).toThrow("Unsupported lookup result layout version");
});

test("readPretokenizedResultLayout maps fields in order", () => {
  expect(readPretokenizedResultLayout(createPretokenizerLibrary())).toEqual({
    layoutVersion: PRETOKENIZED_RESULT_LAYOUT_VERSION,
    arrayLayoutKind: 0,
    arrayItemsOffset: 8,
    arrayLenOffset: 16,
    resultSize: 128,
    surfaceOffset: 0,
    normalizedOffset: 8,
    dictionaryFormOffset: 16,
    readingOffset: 24,
    posOffset: 32,
    beginByteOffset: 40,
    endByteOffset: 48,
    beginCharOffset: 56,
    endCharOffset: 64,
    wordIdOffset: 72,
    posIdOffset: 80,
    dictionaryIdOffset: 84,
    isOovOffset: 88,
    synonymGroupIdsOffset: 96,
    synonymGroupIdsLenOffset: 104,
  });
});

test("readPretokenizedResultLayout rejects unsupported layout versions", () => {
  expect(() =>
    readPretokenizedResultLayout(
      createPretokenizerLibrary((outLayout) => {
        outLayout[0] = 999n;
        return 0;
      }),
    ),
  ).toThrow("Unsupported pretokenized result layout version");
});
