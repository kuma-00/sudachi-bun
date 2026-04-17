import { SudachiError } from "../../types.ts";
import type { LookupResultLayout, NativeLookupLibrary } from "../types.ts";
import { readResultLayout, validateArrayLayout } from "./core.ts";

const LOOKUP_RESULT_LAYOUT_FIELD_COUNT = 18;

export const LOOKUP_RESULT_LAYOUT_VERSION = 1;
export const LOOKUP_RESULT_LAYOUT_EXTENDED_VERSION = 2;

function validateLookupResultLayout(layout: LookupResultLayout): void {
  if (
    layout.layoutVersion !== LOOKUP_RESULT_LAYOUT_VERSION &&
    layout.layoutVersion !== LOOKUP_RESULT_LAYOUT_EXTENDED_VERSION
  ) {
    throw new SudachiError(
      `Unsupported lookup result layout version: expected ${LOOKUP_RESULT_LAYOUT_VERSION} or ${LOOKUP_RESULT_LAYOUT_EXTENDED_VERSION}, received ${layout.layoutVersion}.`,
      { code: "LAYOUT_MISMATCH" },
    );
  }

  validateArrayLayout(
    layout.layoutVersion,
    layout.layoutVersion,
    layout.resultSize,
    layout.arrayLayoutKind,
    "lookup result layout",
  );
}

export function readLookupResultLayout(
  library: NativeLookupLibrary,
): LookupResultLayout {
  return readResultLayout(
    library,
    LOOKUP_RESULT_LAYOUT_FIELD_COUNT,
    library.symbols.sudachi_get_lookup_result_layout,
    "Failed to read the lookup result layout.",
    (values) => {
      const layoutVersion = values[0] ?? 0;
      if (layoutVersion === LOOKUP_RESULT_LAYOUT_VERSION) {
        return {
          layoutVersion,
          arrayLayoutKind: values[1] ?? 0,
          arrayItemsOffset: values[2] ?? 0,
          arrayLenOffset: values[3] ?? 0,
          resultSize: values[4] ?? 0,
          surfaceOffset: values[5] ?? 0,
          posOffset: values[6] ?? 0,
          wordIdOffset: values[7] ?? 0,
          posIdOffset: values[8] ?? 0,
          dictionaryIdOffset: values[9] ?? 0,
          isOovOffset: values[10] ?? 0,
          headWordLengthOffset: 0,
          splitAOffset: 0,
          splitALenOffset: 0,
          splitBOffset: 0,
          splitBLenOffset: 0,
          wordStructureOffset: 0,
          wordStructureLenOffset: 0,
        } satisfies LookupResultLayout;
      }

      return {
        layoutVersion,
        arrayLayoutKind: values[1] ?? 0,
        arrayItemsOffset: values[2] ?? 0,
        arrayLenOffset: values[3] ?? 0,
        resultSize: values[4] ?? 0,
        surfaceOffset: values[5] ?? 0,
        posOffset: values[6] ?? 0,
        wordIdOffset: values[7] ?? 0,
        headWordLengthOffset: values[8] ?? 0,
        splitAOffset: values[9] ?? 0,
        splitALenOffset: values[10] ?? 0,
        splitBOffset: values[11] ?? 0,
        splitBLenOffset: values[12] ?? 0,
        wordStructureOffset: values[13] ?? 0,
        wordStructureLenOffset: values[14] ?? 0,
        posIdOffset: values[15] ?? 0,
        dictionaryIdOffset: values[16] ?? 0,
        isOovOffset: values[17] ?? 0,
      } satisfies LookupResultLayout;
    },
    validateLookupResultLayout,
  );
}
