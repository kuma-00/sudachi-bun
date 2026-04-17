import { SudachiError } from "../../types.ts";
import type {
  NativePretokenizerLibrary,
  PretokenizedResultLayout,
} from "../types.ts";
import { readResultLayout, validateArrayLayout } from "./core.ts";

const PRETOKENIZED_RESULT_LAYOUT_FIELD_COUNT = 27;

export const PRETOKENIZED_RESULT_LAYOUT_VERSION = 1;
export const PRETOKENIZED_RESULT_LAYOUT_EXTENDED_VERSION = 2;

function validatePretokenizedResultLayout(
  layout: PretokenizedResultLayout,
): void {
  if (
    layout.layoutVersion !== PRETOKENIZED_RESULT_LAYOUT_VERSION &&
    layout.layoutVersion !== PRETOKENIZED_RESULT_LAYOUT_EXTENDED_VERSION
  ) {
    throw new SudachiError(
      `Unsupported pretokenized result layout version: expected ${PRETOKENIZED_RESULT_LAYOUT_VERSION} or ${PRETOKENIZED_RESULT_LAYOUT_EXTENDED_VERSION}, received ${layout.layoutVersion}.`,
      { code: "LAYOUT_MISMATCH" },
    );
  }

  validateArrayLayout(
    layout.layoutVersion,
    layout.layoutVersion,
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
    (values) => {
      const layoutVersion = values[0] ?? 0;
      if (layoutVersion === PRETOKENIZED_RESULT_LAYOUT_VERSION) {
        return {
          layoutVersion,
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
          headWordLengthOffset: 0,
          splitAOffset: 0,
          splitALenOffset: 0,
          splitBOffset: 0,
          splitBLenOffset: 0,
          wordStructureOffset: 0,
          wordStructureLenOffset: 0,
          synonymGroupIdsOffset: values[18] ?? 0,
          synonymGroupIdsLenOffset: values[19] ?? 0,
        } satisfies PretokenizedResultLayout;
      }

      return {
        layoutVersion,
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
        headWordLengthOffset: values[15] ?? 0,
        splitAOffset: values[16] ?? 0,
        splitALenOffset: values[17] ?? 0,
        splitBOffset: values[18] ?? 0,
        splitBLenOffset: values[19] ?? 0,
        wordStructureOffset: values[20] ?? 0,
        wordStructureLenOffset: values[21] ?? 0,
        posIdOffset: values[22] ?? 0,
        dictionaryIdOffset: values[23] ?? 0,
        isOovOffset: values[24] ?? 0,
        synonymGroupIdsOffset: values[25] ?? 0,
        synonymGroupIdsLenOffset: values[26] ?? 0,
      } satisfies PretokenizedResultLayout;
    },
    validatePretokenizedResultLayout,
  );
}
