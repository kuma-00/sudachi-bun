import type { NativeSudachiLibrary, PosMatcherResultLayout } from "../types.ts";
import { readResultLayout, validateArrayLayout } from "./core.ts";

const POS_MATCHER_RESULT_LAYOUT_FIELD_COUNT = 5;

export const POS_MATCHER_RESULT_LAYOUT_VERSION = 1;

function validatePosMatcherResultLayout(layout: PosMatcherResultLayout): void {
  validateArrayLayout(
    layout.layoutVersion,
    POS_MATCHER_RESULT_LAYOUT_VERSION,
    layout.resultSize,
    layout.arrayLayoutKind,
    "POS matcher result layout",
  );
}

export function readPosMatcherResultLayout(library: NativeSudachiLibrary): PosMatcherResultLayout {
  return readResultLayout(
    library,
    POS_MATCHER_RESULT_LAYOUT_FIELD_COUNT,
    library.symbols.sudachi_get_pos_matcher_result_layout,
    "Failed to read the POS matcher result layout.",
    (values) =>
      ({
        layoutVersion: values[0] ?? 0,
        arrayLayoutKind: values[1] ?? 0,
        arrayItemsOffset: values[2] ?? 0,
        arrayLenOffset: values[3] ?? 0,
        resultSize: values[4] ?? 0,
      }) satisfies PosMatcherResultLayout,
    validatePosMatcherResultLayout,
  );
}
