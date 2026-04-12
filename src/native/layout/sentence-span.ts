import type {
  NativeSentenceSplitterLibrary,
  SentenceSpanResultLayout,
} from "../types.ts";
import { readResultLayout, validateArrayLayout } from "./core.ts";

const SENTENCE_SPAN_RESULT_LAYOUT_FIELD_COUNT = 7;

export const SENTENCE_SPAN_RESULT_LAYOUT_VERSION = 1;

function validateSentenceSpanResultLayout(
  layout: SentenceSpanResultLayout,
): void {
  validateArrayLayout(
    layout.layoutVersion,
    SENTENCE_SPAN_RESULT_LAYOUT_VERSION,
    layout.resultSize,
    layout.arrayLayoutKind,
    "sentence span result layout",
  );
}

export function readSentenceSpanResultLayout(
  library: NativeSentenceSplitterLibrary,
): SentenceSpanResultLayout {
  return readResultLayout(
    library,
    SENTENCE_SPAN_RESULT_LAYOUT_FIELD_COUNT,
    library.symbols.sudachi_get_sentence_span_layout,
    "Failed to read the sentence span result layout.",
    (values) =>
      ({
        layoutVersion: values[0] ?? 0,
        arrayLayoutKind: values[1] ?? 0,
        arrayItemsOffset: values[2] ?? 0,
        arrayLenOffset: values[3] ?? 0,
        resultSize: values[4] ?? 0,
        startOffset: values[5] ?? 0,
        endOffset: values[6] ?? 0,
      }) satisfies SentenceSpanResultLayout,
    validateSentenceSpanResultLayout,
  );
}
