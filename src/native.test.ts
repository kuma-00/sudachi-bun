import { expect, test } from "bun:test";

import {
  LOOKUP_RESULT_LAYOUT_VERSION,
  MORPHEME_RESULT_LAYOUT_VERSION,
  POS_MATCHER_RESULT_LAYOUT_VERSION,
  readLookupResultLayout,
  readMorphemeResultLayout,
  readPosMatcherResultLayout,
  readNativeStatusCodeName,
  type NativeLookupLibrary,
  type NativeSudachiLibrary,
} from "./native.ts";

function createLibrary(
  layoutWriter: (outLayout: BigUint64Array) => number = (outLayout) => {
    const values = [
      BigInt(MORPHEME_RESULT_LAYOUT_VERSION),
      0n,
      8n,
      16n,
      96n,
      0n,
      8n,
      16n,
      24n,
      32n,
      40n,
      48n,
      56n,
      64n,
      68n,
      72n,
      80n,
      88n,
    ];

    values.forEach((value, index) => {
      outLayout[index] = value;
    });

    return 0;
  },
  posMatcherLayoutWriter: (outLayout: BigUint64Array) => number = layoutWriter,
): NativeSudachiLibrary {
  return {
    symbols: {
      sudachi_create_tokenizer: () => 0,
      sudachi_free_tokenizer: () => {},
      sudachi_tokenize: () => 0,
      sudachi_split_morpheme: () => 0,
      sudachi_split_morphemes: () => 0,
      sudachi_compile_pos_matcher: () => 0,
      sudachi_free_result: () => {},
      sudachi_free_pos_matcher_result: () => {},
      sudachi_get_morpheme_result_layout: (outLayout) => layoutWriter(outLayout as BigUint64Array),
      sudachi_get_pos_matcher_result_layout: (outLayout) => posMatcherLayoutWriter(outLayout as BigUint64Array),
      sudachi_get_last_error: () => "native error" as unknown as import("bun:ffi").CString,
      sudachi_status_code_name: (status) =>
        (status === 5 ? "TOKENIZE" : "UNKNOWN") as unknown as import("bun:ffi").CString,
    },
    close: () => {},
  };
}

function createLookupLibrary(
  layoutWriter: (outLayout: BigUint64Array) => number = (outLayout) => {
    const values = [
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
    ];

    values.forEach((value, index) => {
      outLayout[index] = value;
    });

    return 0;
  },
): NativeLookupLibrary {
  return {
    symbols: {
      sudachi_lookup: () => 0,
      sudachi_free_lookup_result: () => {},
      sudachi_get_lookup_result_layout: (outLayout) => layoutWriter(outLayout as BigUint64Array),
      sudachi_get_last_error: () => "native error" as unknown as import("bun:ffi").CString,
      sudachi_status_code_name: (status) =>
        (status === 9 ? "LOOKUP" : "UNKNOWN") as unknown as import("bun:ffi").CString,
    },
    close: () => {},
  };
}

function createPosMatcherLibrary(
  layoutWriter: (outLayout: BigUint64Array) => number = (outLayout) => {
    const values = [BigInt(POS_MATCHER_RESULT_LAYOUT_VERSION), 0n, 8n, 16n, 2n];

    values.forEach((value, index) => {
      outLayout[index] = value;
    });

    return 0;
  },
): NativeSudachiLibrary {
  return createLibrary(undefined, layoutWriter);
}

test("readMorphemeResultLayout maps the Rust layout buffer in order", () => {
  expect(readMorphemeResultLayout(createLibrary())).toEqual({
    layoutVersion: MORPHEME_RESULT_LAYOUT_VERSION,
    arrayLayoutKind: 0,
    arrayItemsOffset: 8,
    arrayLenOffset: 16,
    resultSize: 96,
    surfaceOffset: 0,
    normalizedOffset: 8,
    dictionaryFormOffset: 16,
    readingOffset: 24,
    posOffset: 32,
    beginOffset: 40,
    endOffset: 48,
    wordIdOffset: 56,
    posIdOffset: 64,
    dictionaryIdOffset: 68,
    isOovOffset: 72,
    synonymGroupIdsOffset: 80,
    synonymGroupIdsLenOffset: 88,
  });
});

test("readMorphemeResultLayout rejects unsupported layout versions", () => {
  expect(() =>
    readMorphemeResultLayout(
      createLibrary((outLayout) => {
        outLayout[0] = 999n;
        return 0;
      }),
    ),
  ).toThrow("Unsupported morpheme result layout version");
});

test("readMorphemeResultLayout rejects unsupported array layout kinds", () => {
  expect(() =>
    readMorphemeResultLayout(
      createLibrary((outLayout) => {
        const values = [
          BigInt(MORPHEME_RESULT_LAYOUT_VERSION),
          2n,
          8n,
          16n,
          96n,
          0n,
          8n,
          16n,
          24n,
          32n,
          40n,
          48n,
          56n,
          64n,
          68n,
          72n,
          80n,
          88n,
        ];
        values.forEach((value, index) => {
          outLayout[index] = value;
        });
        return 0;
      }),
    ),
  ).toThrow("Unsupported morpheme result layout array layout kind");
});

test("readNativeStatusCodeName uses the Rust-provided code names", () => {
  expect(readNativeStatusCodeName(createLibrary(), 5)).toBe("TOKENIZE");
});

test("readLookupResultLayout maps the Rust lookup layout buffer in order", () => {
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

test("readPosMatcherResultLayout maps the Rust POS matcher layout buffer in order", () => {
  expect(readPosMatcherResultLayout(createPosMatcherLibrary())).toEqual({
    layoutVersion: POS_MATCHER_RESULT_LAYOUT_VERSION,
    arrayLayoutKind: 0,
    arrayItemsOffset: 8,
    arrayLenOffset: 16,
    resultSize: 2,
  });
});

test("readPosMatcherResultLayout rejects unsupported layout versions", () => {
  expect(() =>
    readPosMatcherResultLayout(
      createPosMatcherLibrary((outLayout) => {
        outLayout[0] = 999n;
        return 0;
      }),
    ),
  ).toThrow("Unsupported POS matcher result layout version");
});
