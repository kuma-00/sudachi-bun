import { SudachiError } from "../../types.ts";
import type { NativeSudachiLibrary, PosTupleResultLayout } from "../types.ts";
import { readResultLayout, validateArrayLayout } from "./core.ts";

const POS_TUPLE_RESULT_LAYOUT_FIELD_COUNT = 5;

export const POS_TUPLE_RESULT_LAYOUT_VERSION = 1;

function validatePosTupleResultLayout(layout: PosTupleResultLayout): void {
  validateArrayLayout(
    layout.layoutVersion,
    POS_TUPLE_RESULT_LAYOUT_VERSION,
    layout.resultSize,
    layout.arrayLayoutKind,
    "POS tuple result layout",
  );
}

export function readPosTupleResultLayout(
  library: NativeSudachiLibrary,
): PosTupleResultLayout {
  return readResultLayout(
    library,
    POS_TUPLE_RESULT_LAYOUT_FIELD_COUNT,
    (outLayout) => {
      const readLayout = library.symbols.sudachi_get_pos_tuple_result_layout;
      if (readLayout === undefined) {
        throw new SudachiError(
          "Native library does not expose POS tuple result layout.",
          { code: "LAYOUT_MISMATCH" },
        );
      }
      return readLayout(outLayout);
    },
    "Failed to read the POS tuple result layout.",
    (values) =>
      ({
        layoutVersion: values[0] ?? 0,
        arrayLayoutKind: values[1] ?? 0,
        arrayItemsOffset: values[2] ?? 0,
        arrayLenOffset: values[3] ?? 0,
        resultSize: values[4] ?? 0,
      }) satisfies PosTupleResultLayout,
    validatePosTupleResultLayout,
  );
}
