import type { LookupResultLayout, NativeLookupLibrary } from "../types.ts";
import { readResultLayout, validateArrayLayout } from "./core.ts";

const LOOKUP_RESULT_LAYOUT_FIELD_COUNT = 11;

export const LOOKUP_RESULT_LAYOUT_VERSION = 1;

function validateLookupResultLayout(layout: LookupResultLayout): void {
  validateArrayLayout(
    layout.layoutVersion,
    LOOKUP_RESULT_LAYOUT_VERSION,
    layout.resultSize,
    layout.arrayLayoutKind,
    "lookup result layout",
  );
}

export function readLookupResultLayout(library: NativeLookupLibrary): LookupResultLayout {
  return readResultLayout(
    library,
    LOOKUP_RESULT_LAYOUT_FIELD_COUNT,
    library.symbols.sudachi_get_lookup_result_layout,
    "Failed to read the lookup result layout.",
    (values) =>
      ({
        layoutVersion: values[0] ?? 0,
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
      }) satisfies LookupResultLayout,
    validateLookupResultLayout,
  );
}
