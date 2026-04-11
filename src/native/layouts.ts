import { SudachiError } from "../types.ts";

import { createNativeSudachiError } from "./errors.ts";
import type {
  LookupResultLayout,
  MorphemeResultLayout,
  NativeErrorLibrary,
  NativeLookupLibrary,
  NativePretokenizerLibrary,
  NativeSentenceSplitterLibrary,
  NativeSudachiLibrary,
  PosMatcherResultLayout,
  PretokenizedResultLayout,
  SentenceSpanResultLayout,
} from "./types.ts";

const MORPHEME_RESULT_LAYOUT_FIELD_COUNT = 18;
const LOOKUP_RESULT_LAYOUT_FIELD_COUNT = 11;
const PRETOKENIZED_RESULT_LAYOUT_FIELD_COUNT = 20;
const POS_MATCHER_RESULT_LAYOUT_FIELD_COUNT = 5;
const SENTENCE_SPAN_RESULT_LAYOUT_FIELD_COUNT = 7;

export const MORPHEME_RESULT_LAYOUT_VERSION = 1;
export const LOOKUP_RESULT_LAYOUT_VERSION = 1;
export const PRETOKENIZED_RESULT_LAYOUT_VERSION = 1;
export const POS_MATCHER_RESULT_LAYOUT_VERSION = 1;
export const SENTENCE_SPAN_RESULT_LAYOUT_VERSION = 1;

function validateArrayLayout(
  layoutVersion: number,
  expectedVersion: number,
  resultSize: number,
  arrayLayoutKind: number,
  label: string,
): void {
  if (layoutVersion !== expectedVersion) {
    throw new SudachiError(
      `Unsupported ${label} version: expected ${expectedVersion}, received ${layoutVersion}.`,
      { code: "LAYOUT_MISMATCH" },
    );
  }

  if (resultSize <= 0) {
    throw new SudachiError(`Received an invalid ${label} size.`, {
      code: "LAYOUT_MISMATCH",
    });
  }

  if (arrayLayoutKind !== 0 && arrayLayoutKind !== 1) {
    throw new SudachiError(`Unsupported ${label} array layout kind: ${arrayLayoutKind}.`, {
      code: "LAYOUT_MISMATCH",
    });
  }
}

function validateMorphemeResultLayout(layout: MorphemeResultLayout): void {
  validateArrayLayout(
    layout.layoutVersion,
    MORPHEME_RESULT_LAYOUT_VERSION,
    layout.resultSize,
    layout.arrayLayoutKind,
    "morpheme result layout",
  );
}

function validateSentenceSpanResultLayout(layout: SentenceSpanResultLayout): void {
  validateArrayLayout(
    layout.layoutVersion,
    SENTENCE_SPAN_RESULT_LAYOUT_VERSION,
    layout.resultSize,
    layout.arrayLayoutKind,
    "sentence span result layout",
  );
}

function validateLookupResultLayout(layout: LookupResultLayout): void {
  validateArrayLayout(
    layout.layoutVersion,
    LOOKUP_RESULT_LAYOUT_VERSION,
    layout.resultSize,
    layout.arrayLayoutKind,
    "lookup result layout",
  );
}

function validatePretokenizedResultLayout(layout: PretokenizedResultLayout): void {
  validateArrayLayout(
    layout.layoutVersion,
    PRETOKENIZED_RESULT_LAYOUT_VERSION,
    layout.resultSize,
    layout.arrayLayoutKind,
    "pretokenized result layout",
  );
}

function validatePosMatcherResultLayout(layout: PosMatcherResultLayout): void {
  validateArrayLayout(
    layout.layoutVersion,
    POS_MATCHER_RESULT_LAYOUT_VERSION,
    layout.resultSize,
    layout.arrayLayoutKind,
    "POS matcher result layout",
  );
}

function readResultLayout<TLayout>(
  library: NativeErrorLibrary,
  fieldCount: number,
  readLayout: (outLayout: BigUint64Array) => number,
  fallbackMessage: string,
  buildLayout: (values: readonly number[]) => TLayout,
  validateLayout: (layout: TLayout) => void,
): TLayout {
  const outLayout = new BigUint64Array(fieldCount);
  const status = readLayout(outLayout);
  if (status !== 0) {
    throw createNativeSudachiError(library, status, fallbackMessage);
  }

  const layout = buildLayout(Array.from(outLayout, (value) => Number(value)));
  validateLayout(layout);
  return layout;
}

export function readMorphemeResultLayout(library: NativeSudachiLibrary): MorphemeResultLayout {
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

export function readPretokenizedResultLayout(library: NativePretokenizerLibrary): PretokenizedResultLayout {
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

export function readSentenceSpanResultLayout(library: NativeSentenceSplitterLibrary): SentenceSpanResultLayout {
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
