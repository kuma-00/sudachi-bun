import { expect, test } from "bun:test";

import { readMorphemeResultLayout, type NativeSudachiLibrary } from "./native.ts";

test("readMorphemeResultLayout maps the Rust layout buffer in order", () => {
  const library: NativeSudachiLibrary = {
    symbols: {
      sudachi_create_tokenizer: () => 0,
      sudachi_free_tokenizer: () => {},
      sudachi_tokenize: () => 0,
      sudachi_free_result: () => {},
      sudachi_get_morpheme_result_layout: (outLayout) => {
        const layout = outLayout as BigUint64Array;
        const values = [
          0n,
          8n,
          16n,
          104n,
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
          96n,
        ];

        values.forEach((value, index) => {
          layout[index] = value;
        });
        return 0;
      },
      sudachi_get_last_error: () => undefined as unknown as import("bun:ffi").CString,
    },
    close: () => {},
  };

  expect(readMorphemeResultLayout(library)).toEqual({
    arrayLayoutKind: 0,
    arrayItemsOffset: 8,
    arrayLenOffset: 16,
    resultSize: 104,
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
    detailJsonOffset: 96,
  });
});
