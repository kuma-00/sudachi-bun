import { expect, test } from "bun:test";

import { SudachiError } from "../../types.ts";
import type {
  NativeLookupLibrary,
  NativePretokenizerLibrary,
  NativeSudachiLibrary,
} from "../types.ts";
import {
  LOOKUP_RESULT_LAYOUT_EXTENDED_VERSION,
  LOOKUP_RESULT_LAYOUT_VERSION,
  readLookupResultLayout,
} from "./lookup.ts";
import {
  MORPHEME_RESULT_LAYOUT_EXTENDED_VERSION,
  MORPHEME_RESULT_LAYOUT_VERSION,
  readMorphemeResultLayout,
} from "./morpheme.ts";
import {
  PRETOKENIZED_RESULT_LAYOUT_EXTENDED_VERSION,
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
      24n,
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
      92n,
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
      sudachi_inspect_dictionary_bytes: () => 0,
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
    arrayInternalCostOffset: 24,
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
    totalCostOffset: 92,
    headWordLengthOffset: 0,
    splitAOffset: 0,
    splitALenOffset: 0,
    splitBOffset: 0,
    splitBLenOffset: 0,
    wordStructureOffset: 0,
    wordStructureLenOffset: 0,
    synonymGroupIdsOffset: 96,
    synonymGroupIdsLenOffset: 104,
  });
});

test("readMorphemeResultLayout rejects unsupported layout versions", () => {
  try {
    readMorphemeResultLayout(
      createMorphemeLibrary((outLayout) => {
        outLayout[0] = 999n;
        return 0;
      }),
    );
    throw new Error("Expected readMorphemeResultLayout to throw.");
  } catch (error) {
    expect(error).toBeInstanceOf(SudachiError);
    expect(error).toMatchObject({
      code: "LAYOUT_MISMATCH",
      message:
        "Unsupported morpheme result layout version: expected 2, 3, or 4, received 999.",
    });
  }
});

test("readMorphemeResultLayout maps extended layout fields in order", () => {
  expect(
    readMorphemeResultLayout(
      createMorphemeLibrary((outLayout) =>
        writeLayout(outLayout, [
          BigInt(MORPHEME_RESULT_LAYOUT_EXTENDED_VERSION),
          0n,
          8n,
          16n,
          24n,
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
          81n,
          88n,
          96n,
          104n,
          112n,
          120n,
          128n,
          136n,
          140n,
          141n,
          148n,
          144n,
          152n,
        ]),
      ),
    ),
  ).toMatchObject({
    layoutVersion: MORPHEME_RESULT_LAYOUT_EXTENDED_VERSION,
    headWordLengthOffset: 81,
    splitAOffset: 88,
    splitALenOffset: 96,
    splitBOffset: 104,
    splitBLenOffset: 112,
    wordStructureOffset: 120,
    wordStructureLenOffset: 128,
    posIdOffset: 136,
    dictionaryIdOffset: 140,
    isOovOffset: 141,
    totalCostOffset: 148,
    synonymGroupIdsOffset: 144,
    synonymGroupIdsLenOffset: 152,
  });
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
    headWordLengthOffset: 0,
    splitAOffset: 0,
    splitALenOffset: 0,
    splitBOffset: 0,
    splitBLenOffset: 0,
    wordStructureOffset: 0,
    wordStructureLenOffset: 0,
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

test("readLookupResultLayout maps extended layout fields in order", () => {
  expect(
    readLookupResultLayout(
      createLookupLibrary((outLayout) =>
        writeLayout(outLayout, [
          BigInt(LOOKUP_RESULT_LAYOUT_EXTENDED_VERSION),
          0n,
          8n,
          16n,
          40n,
          0n,
          8n,
          16n,
          33n,
          36n,
          44n,
          52n,
          60n,
          68n,
          76n,
          24n,
          28n,
          32n,
        ]),
      ),
    ),
  ).toMatchObject({
    layoutVersion: LOOKUP_RESULT_LAYOUT_EXTENDED_VERSION,
    headWordLengthOffset: 33,
    splitAOffset: 36,
    splitALenOffset: 44,
    splitBOffset: 52,
    splitBLenOffset: 60,
    wordStructureOffset: 68,
    wordStructureLenOffset: 76,
    posIdOffset: 24,
    dictionaryIdOffset: 28,
    isOovOffset: 32,
  });
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
    headWordLengthOffset: 0,
    splitAOffset: 0,
    splitALenOffset: 0,
    splitBOffset: 0,
    splitBLenOffset: 0,
    wordStructureOffset: 0,
    wordStructureLenOffset: 0,
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

test("readPretokenizedResultLayout maps extended layout fields in order", () => {
  expect(
    readPretokenizedResultLayout(
      createPretokenizerLibrary((outLayout) =>
        writeLayout(outLayout, [
          BigInt(PRETOKENIZED_RESULT_LAYOUT_EXTENDED_VERSION),
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
          89n,
          96n,
          104n,
          112n,
          120n,
          128n,
          136n,
          84n,
          88n,
          92n,
          144n,
          152n,
        ]),
      ),
    ),
  ).toMatchObject({
    layoutVersion: PRETOKENIZED_RESULT_LAYOUT_EXTENDED_VERSION,
    headWordLengthOffset: 89,
    splitAOffset: 96,
    splitALenOffset: 104,
    splitBOffset: 112,
    splitBLenOffset: 120,
    wordStructureOffset: 128,
    wordStructureLenOffset: 136,
    posIdOffset: 84,
    dictionaryIdOffset: 88,
    isOovOffset: 92,
    synonymGroupIdsOffset: 144,
    synonymGroupIdsLenOffset: 152,
  });
});
