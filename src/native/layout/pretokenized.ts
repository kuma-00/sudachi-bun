import type {
  NativePretokenizerLibrary,
  PretokenizedResultLayout,
} from "../types.ts";
import { readResultLayout, validateArrayLayout } from "./core.ts";

const PRETOKENIZED_RESULT_LAYOUT_FIELD_COUNT = 20;

export const PRETOKENIZED_RESULT_LAYOUT_VERSION = 1;

function validatePretokenizedResultLayout(
  layout: PretokenizedResultLayout,
): void {
  validateArrayLayout(
    layout.layoutVersion,
    PRETOKENIZED_RESULT_LAYOUT_VERSION,
    layout.resultSize,
    layout.arrayLayoutKind,
    "pretokenized result layout",
  );
}

export function readPretokenizedResultLayout(
  library: NativePretokenizerLibrary,
): PretokenizedResultLayout {
  return readResultLayout(
    library,
    PRETOKENIZED_RESULT_LAYOUT_FIELD_COUNT,
    library.symbols.sudachi_get_pretokenized_result_layout,
    "Failed to read the pretokenized result layout.",
    (values) =>
      ({
        layoutVersion: values[0] ?? 0,
        arrayLayoutKind: values[1] ?? 0,
        arrayItemsOffset: values[2] ?? 0,
        arrayLenOffset: values[3] ?? 0,
        resultSize: values[4] ?? 0,
        surfaceOffset: values[5] ?? 0,
        normalizedOffset: values[6] ?? 0,
        dictionaryFormOffset: values[7] ?? 0,
        readingOffset: values[8] ?? 0,
        posOffset: values[9] ?? 0,
        beginByteOffset: values[10] ?? 0,
        endByteOffset: values[11] ?? 0,
        beginCharOffset: values[12] ?? 0,
        endCharOffset: values[13] ?? 0,
        wordIdOffset: values[14] ?? 0,
        posIdOffset: values[15] ?? 0,
        dictionaryIdOffset: values[16] ?? 0,
        isOovOffset: values[17] ?? 0,
        synonymGroupIdsOffset: values[18] ?? 0,
        synonymGroupIdsLenOffset: values[19] ?? 0,
      }) satisfies PretokenizedResultLayout,
    validatePretokenizedResultLayout,
  );
}
