import { SudachiError } from "../../types.ts";
import type {
  DictionaryInspectionResultLayout,
  NativeSudachiLibrary,
} from "../types.ts";
import { readResultLayout } from "./core.ts";

const DICTIONARY_INSPECTION_RESULT_LAYOUT_FIELD_COUNT = 8;
const DICTIONARY_INSPECTION_RESULT_FIELD_SIZE = 4;

export const DICTIONARY_INSPECTION_RESULT_LAYOUT_VERSION = 1;

function validateDictionaryInspectionResultLayout(
  layout: DictionaryInspectionResultLayout,
): void {
  if (layout.layoutVersion !== DICTIONARY_INSPECTION_RESULT_LAYOUT_VERSION) {
    throw new SudachiError(
      `Unsupported dictionary inspection result layout version: expected ${DICTIONARY_INSPECTION_RESULT_LAYOUT_VERSION}, received ${layout.layoutVersion}.`,
      { code: "LAYOUT_MISMATCH" },
    );
  }

  if (layout.resultSize < DICTIONARY_INSPECTION_RESULT_FIELD_SIZE) {
    throw new SudachiError(
      "Received an invalid dictionary inspection result size.",
      { code: "LAYOUT_MISMATCH" },
    );
  }

  const offsets = [
    layout.kindOffset,
    layout.headerVersionOffset,
    layout.isLoadableOffset,
  ];
  if (
    offsets.some(
      (offset) =>
        offset > layout.resultSize - DICTIONARY_INSPECTION_RESULT_FIELD_SIZE,
    )
  ) {
    throw new SudachiError(
      "Received an invalid dictionary inspection result layout.",
      { code: "LAYOUT_MISMATCH" },
    );
  }

  const kindValues = new Set([
    layout.kindUnknownValue,
    layout.kindSystemValue,
    layout.kindUserValue,
  ]);
  if (kindValues.size !== 3) {
    throw new SudachiError(
      "Received an invalid dictionary inspection result kind mapping.",
      { code: "LAYOUT_MISMATCH" },
    );
  }
}

export function readDictionaryInspectionResultLayout(
  library: NativeSudachiLibrary,
): DictionaryInspectionResultLayout {
  const readLayout =
    library.symbols.sudachi_get_dictionary_inspection_result_layout;
  if (!readLayout) {
    throw new SudachiError(
      "Native dictionary inspection result layout getter is unavailable.",
      { code: "LAYOUT_MISMATCH" },
    );
  }

  return readResultLayout(
    library,
    DICTIONARY_INSPECTION_RESULT_LAYOUT_FIELD_COUNT,
    readLayout,
    "Failed to read the dictionary inspection result layout.",
    (values) =>
      ({
        layoutVersion: values[0] ?? 0,
        resultSize: values[1] ?? 0,
        kindOffset: values[2] ?? 0,
        headerVersionOffset: values[3] ?? 0,
        isLoadableOffset: values[4] ?? 0,
        kindUnknownValue: values[5] ?? 0,
        kindSystemValue: values[6] ?? 0,
        kindUserValue: values[7] ?? 0,
      }) satisfies DictionaryInspectionResultLayout,
    validateDictionaryInspectionResultLayout,
  );
}
