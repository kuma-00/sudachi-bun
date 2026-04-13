import { SudachiError } from "../../types.ts";
import type { MorphemeResultLayout, NativeSudachiLibrary } from "../types.ts";
import { readResultLayout, validateArrayLayout } from "./core.ts";

const MORPHEME_RESULT_LAYOUT_FIELD_COUNT = 22;

const MORPHEME_RESULT_LAYOUT_LEGACY_VERSION = 2;
export const MORPHEME_RESULT_LAYOUT_VERSION = 3;

function validateMorphemeResultLayout(layout: MorphemeResultLayout): void {
  if (
    layout.layoutVersion !== MORPHEME_RESULT_LAYOUT_LEGACY_VERSION &&
    layout.layoutVersion !== MORPHEME_RESULT_LAYOUT_VERSION
  ) {
    throw new SudachiError(
      `Unsupported morpheme result layout version: expected ${MORPHEME_RESULT_LAYOUT_LEGACY_VERSION} or ${MORPHEME_RESULT_LAYOUT_VERSION}, received ${layout.layoutVersion}.`,
      { code: "LAYOUT_MISMATCH" },
    );
  }

  validateArrayLayout(
    layout.layoutVersion,
    layout.layoutVersion,
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
    (values) => {
      const layoutVersion = values[0] ?? 0;
      if (layoutVersion === MORPHEME_RESULT_LAYOUT_LEGACY_VERSION) {
        return {
          layoutVersion,
          arrayLayoutKind: values[1] ?? 0,
          arrayItemsOffset: values[2] ?? 0,
          arrayLenOffset: values[3] ?? 0,
          arrayInternalCostOffset: 0,
          resultSize: values[4] ?? 0,
          surfaceOffset: values[5] ?? 0,
          normalizedOffset: values[6] ?? 0,
          dictionaryFormOffset: values[7] ?? 0,
          readingOffset: values[8] ?? 0,
          posOffset: values[9] ?? 0,
          beginOffset: values[10] ?? 0,
          endOffset: values[11] ?? 0,
          beginCharOffset: values[12] ?? 0,
          endCharOffset: values[13] ?? 0,
          wordIdOffset: values[14] ?? 0,
          posIdOffset: values[15] ?? 0,
          dictionaryIdOffset: values[16] ?? 0,
          isOovOffset: values[17] ?? 0,
          totalCostOffset: 0,
          synonymGroupIdsOffset: values[18] ?? 0,
          synonymGroupIdsLenOffset: values[19] ?? 0,
        } satisfies MorphemeResultLayout;
      }

      return {
        layoutVersion,
        arrayLayoutKind: values[1] ?? 0,
        arrayItemsOffset: values[2] ?? 0,
        arrayLenOffset: values[3] ?? 0,
        arrayInternalCostOffset: values[4] ?? 0,
        resultSize: values[5] ?? 0,
        surfaceOffset: values[6] ?? 0,
        normalizedOffset: values[7] ?? 0,
        dictionaryFormOffset: values[8] ?? 0,
        readingOffset: values[9] ?? 0,
        posOffset: values[10] ?? 0,
        beginOffset: values[11] ?? 0,
        endOffset: values[12] ?? 0,
        beginCharOffset: values[13] ?? 0,
        endCharOffset: values[14] ?? 0,
        wordIdOffset: values[15] ?? 0,
        posIdOffset: values[16] ?? 0,
        dictionaryIdOffset: values[17] ?? 0,
        isOovOffset: values[18] ?? 0,
        totalCostOffset: values[19] ?? 0,
        synonymGroupIdsOffset: values[20] ?? 0,
        synonymGroupIdsLenOffset: values[21] ?? 0,
      } satisfies MorphemeResultLayout;
    },
    validateMorphemeResultLayout,
  );
}
