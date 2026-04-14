import { SudachiError } from "../../types.ts";
import type {
  DictionaryBuildReportLayout,
  NativeSudachiLibrary,
} from "../types.ts";
import { readResultLayout, validateArrayLayout } from "./core.ts";

const DICTIONARY_BUILD_REPORT_LAYOUT_FIELD_COUNT = 9;
const U64_SIZE = 8;
const DICTIONARY_BUILD_REPORT_ARRAY_ITEMS_OFFSET = 0;
const DICTIONARY_BUILD_REPORT_ARRAY_LEN_OFFSET = 8;
const DICTIONARY_BUILD_REPORT_PART_OFFSET = 0;
const DICTIONARY_BUILD_REPORT_SIZE_OFFSET = 8;
const DICTIONARY_BUILD_REPORT_ELAPSED_MILLIS_OFFSET = 16;
const DICTIONARY_BUILD_REPORT_IS_WRITE_OFFSET = 24;

export const DICTIONARY_BUILD_REPORT_LAYOUT_VERSION = 1;

function validateExactOffset(
  offset: number,
  expectedOffset: number,
  label: string,
): void {
  if (offset !== expectedOffset) {
    throw new SudachiError(`Received an invalid ${label}.`, {
      code: "LAYOUT_MISMATCH",
    });
  }
}

function validateDictionaryBuildReportLayout(
  layout: DictionaryBuildReportLayout,
): void {
  validateArrayLayout(
    layout.layoutVersion,
    DICTIONARY_BUILD_REPORT_LAYOUT_VERSION,
    layout.resultSize,
    layout.arrayLayoutKind,
    "dictionary build report layout",
  );

  if (layout.resultSize < U64_SIZE) {
    throw new SudachiError(
      "Received an invalid dictionary build report entry size.",
      { code: "LAYOUT_MISMATCH" },
    );
  }

  validateExactOffset(
    layout.arrayItemsOffset,
    DICTIONARY_BUILD_REPORT_ARRAY_ITEMS_OFFSET,
    "dictionary build report items offset",
  );
  validateExactOffset(
    layout.arrayLenOffset,
    DICTIONARY_BUILD_REPORT_ARRAY_LEN_OFFSET,
    "dictionary build report length offset",
  );
  validateExactOffset(
    layout.partOffset,
    DICTIONARY_BUILD_REPORT_PART_OFFSET,
    "dictionary build report part offset",
  );
  validateExactOffset(
    layout.sizeOffset,
    DICTIONARY_BUILD_REPORT_SIZE_OFFSET,
    "dictionary build report size offset",
  );
  validateExactOffset(
    layout.elapsedMillisOffset,
    DICTIONARY_BUILD_REPORT_ELAPSED_MILLIS_OFFSET,
    "dictionary build report elapsed-millis offset",
  );
  validateExactOffset(
    layout.isWriteOffset,
    DICTIONARY_BUILD_REPORT_IS_WRITE_OFFSET,
    "dictionary build report is-write offset",
  );
}

export function readDictionaryBuildReportLayout(
  library: NativeSudachiLibrary,
): DictionaryBuildReportLayout {
  const readLayout = library.symbols.sudachi_get_dictionary_build_report_layout;
  if (!readLayout) {
    throw new SudachiError(
      "Native dictionary build report layout getter is unavailable.",
      { code: "LAYOUT_MISMATCH" },
    );
  }

  return readResultLayout(
    library,
    DICTIONARY_BUILD_REPORT_LAYOUT_FIELD_COUNT,
    readLayout,
    "Failed to read the dictionary build report layout.",
    (values) =>
      ({
        layoutVersion: values[0] ?? 0,
        arrayLayoutKind: values[1] ?? 0,
        arrayItemsOffset: values[2] ?? 0,
        arrayLenOffset: values[3] ?? 0,
        resultSize: values[4] ?? 0,
        partOffset: values[5] ?? 0,
        sizeOffset: values[6] ?? 0,
        elapsedMillisOffset: values[7] ?? 0,
        isWriteOffset: values[8] ?? 0,
      }) satisfies DictionaryBuildReportLayout,
    validateDictionaryBuildReportLayout,
  );
}
