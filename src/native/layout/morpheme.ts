import type { MorphemeResultLayout, NativeSudachiLibrary } from "../types.ts";
import { readResultLayout, validateArrayLayout } from "./core.ts";

const MORPHEME_RESULT_LAYOUT_FIELD_COUNT = 18;

export const MORPHEME_RESULT_LAYOUT_VERSION = 1;

function validateMorphemeResultLayout(layout: MorphemeResultLayout): void {
  validateArrayLayout(
    layout.layoutVersion,
    MORPHEME_RESULT_LAYOUT_VERSION,
    layout.resultSize,
    layout.arrayLayoutKind,
    "morpheme result layout",
  );
}

export function readMorphemeResultLayout(
  library: NativeSudachiLibrary,
): MorphemeResultLayout {
  return readResultLayout(
    library,
    MORPHEME_RESULT_LAYOUT_FIELD_COUNT,
    library.symbols.sudachi_get_morpheme_result_layout,
    "Failed to read the morpheme result layout.",
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
        beginOffset: values[10] ?? 0,
        endOffset: values[11] ?? 0,
        wordIdOffset: values[12] ?? 0,
        posIdOffset: values[13] ?? 0,
        dictionaryIdOffset: values[14] ?? 0,
        isOovOffset: values[15] ?? 0,
        synonymGroupIdsOffset: values[16] ?? 0,
        synonymGroupIdsLenOffset: values[17] ?? 0,
      }) satisfies MorphemeResultLayout,
    validateMorphemeResultLayout,
  );
}
