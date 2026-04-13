import { expect, test } from "bun:test";

import { SudachiError } from "../../types.ts";
import type { NativeSudachiLibrary } from "../types.ts";
import {
  DICTIONARY_INSPECTION_RESULT_LAYOUT_VERSION,
  readDictionaryInspectionResultLayout,
} from "./dictionary-inspection.ts";

function createDictionaryInspectionLibrary(
  layoutWriter: (outLayout: BigUint64Array) => number = (outLayout) => {
    const values = [
      BigInt(DICTIONARY_INSPECTION_RESULT_LAYOUT_VERSION),
      16n,
      4n,
      8n,
      12n,
      99n,
      7n,
      13n,
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
      sudachi_get_morpheme_result_layout: () => 0,
      sudachi_get_dictionary_inspection_result_layout: (outLayout) =>
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

test("readDictionaryInspectionResultLayout maps fields in order", () => {
  expect(
    readDictionaryInspectionResultLayout(createDictionaryInspectionLibrary()),
  ).toEqual({
    layoutVersion: DICTIONARY_INSPECTION_RESULT_LAYOUT_VERSION,
    resultSize: 16,
    kindOffset: 4,
    headerVersionOffset: 8,
    isLoadableOffset: 12,
    kindUnknownValue: 99,
    kindSystemValue: 7,
    kindUserValue: 13,
  });
});

test("readDictionaryInspectionResultLayout rejects unsupported layout versions", () => {
  expect(() =>
    readDictionaryInspectionResultLayout(
      createDictionaryInspectionLibrary((outLayout) => {
        outLayout[0] = 999n;
        return 0;
      }),
    ),
  ).toThrow(SudachiError);
});
