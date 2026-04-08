import { expect, test } from "bun:test";

import {
  MORPHEME_RESULT_LAYOUT_VERSION,
  readMorphemeResultLayout,
  readNativeStatusCodeName,
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
): NativeSudachiLibrary {
  return {
    symbols: {
      sudachi_create_tokenizer: () => 0,
      sudachi_free_tokenizer: () => {},
      sudachi_tokenize: () => 0,
      sudachi_free_result: () => {},
      sudachi_get_morpheme_result_layout: (outLayout) => layoutWriter(outLayout as BigUint64Array),
      sudachi_get_last_error: () => "native error" as unknown as import("bun:ffi").CString,
      sudachi_status_code_name: (status) =>
        (status === 5 ? "TOKENIZE" : "UNKNOWN") as unknown as import("bun:ffi").CString,
    },
    close: () => {},
  };
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
  ).toThrow("Unsupported morpheme result array layout kind");
});

test("readNativeStatusCodeName uses the Rust-provided code names", () => {
  expect(readNativeStatusCodeName(createLibrary(), 5)).toBe("TOKENIZE");
});
