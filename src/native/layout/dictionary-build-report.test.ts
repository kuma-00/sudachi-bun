import { expect, test } from "bun:test";

import { SudachiError } from "../../types.ts";
import type { NativeSudachiLibrary } from "../types.ts";
import {
  DICTIONARY_BUILD_REPORT_LAYOUT_VERSION,
  readDictionaryBuildReportLayout,
} from "./dictionary-build-report.ts";

function createDictionaryBuildReportLibrary(
  layoutWriter: (outLayout: BigUint64Array) => number = (outLayout) => {
    const values = [
      BigInt(DICTIONARY_BUILD_REPORT_LAYOUT_VERSION),
      0n,
      0n,
      8n,
      32n,
      0n,
      8n,
      16n,
      24n,
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
      sudachi_build_system_dictionary: () => 0,
      sudachi_build_user_dictionary: () => 0,
      sudachi_inspect_dictionary_bytes: () => 0,
      sudachi_free_result: () => {},
      sudachi_free_pos_matcher_result: () => {},
      sudachi_free_dictionary_build_report: () => {},
      sudachi_get_morpheme_result_layout: () => 0,
      sudachi_get_dictionary_inspection_result_layout: () => 0,
      sudachi_get_dictionary_build_report_layout: (outLayout) =>
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

test("readDictionaryBuildReportLayout maps fields in order", () => {
  expect(
    readDictionaryBuildReportLayout(createDictionaryBuildReportLibrary()),
  ).toEqual({
    layoutVersion: DICTIONARY_BUILD_REPORT_LAYOUT_VERSION,
    arrayLayoutKind: 0,
    arrayItemsOffset: 0,
    arrayLenOffset: 8,
    resultSize: 32,
    partOffset: 0,
    sizeOffset: 8,
    elapsedMillisOffset: 16,
    isWriteOffset: 24,
  });
});

test("readDictionaryBuildReportLayout rejects unsupported layout versions", () => {
  expect(() =>
    readDictionaryBuildReportLayout(
      createDictionaryBuildReportLibrary((outLayout) => {
        outLayout[0] = 999n;
        return 0;
      }),
    ),
  ).toThrow(SudachiError);
});

test("readDictionaryBuildReportLayout rejects invalid size and offset combinations", () => {
  expect(() =>
    readDictionaryBuildReportLayout(
      createDictionaryBuildReportLibrary((outLayout) => {
        outLayout[4] = 4n;
        outLayout[6] = 8n;
        return 0;
      }),
    ),
  ).toThrow(SudachiError);
});

test("readDictionaryBuildReportLayout rejects non-exact array offsets", () => {
  expect(() =>
    readDictionaryBuildReportLayout(
      createDictionaryBuildReportLibrary((outLayout) => {
        outLayout[2] = 4n;
        outLayout[3] = 12n;
        return 0;
      }),
    ),
  ).toThrow(SudachiError);
});

test("readDictionaryBuildReportLayout requires layout getter", () => {
  const library = createDictionaryBuildReportLibrary();
  delete library.symbols.sudachi_get_dictionary_build_report_layout;

  expect(() => readDictionaryBuildReportLayout(library)).toThrow(SudachiError);
});
