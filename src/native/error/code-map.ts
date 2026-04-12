import type { NativeSudachiErrorCode } from "../../types.ts";

export const NATIVE_STATUS_CODE_MAP: Readonly<Record<string, NativeSudachiErrorCode>> = {
  OK: "OK",
  NULL_POINTER: "NULL_POINTER",
  INVALID_UTF8: "INVALID_UTF8",
  INVALID_MODE: "INVALID_MODE",
  INVALID_INDEX: "INVALID_INDEX",
  CONFIG: "CONFIG",
  TOKENIZE: "TOKENIZE",
  SPLIT: "SPLIT",
  LOOKUP: "LOOKUP",
  PRETOKENIZE: "PRETOKENIZE",
  PRETOKENIZER: "PRETOKENIZER",
  MORPHEME_SPLIT: "MORPHEME_SPLIT",
  SENTENCE_SPLIT: "SENTENCE_SPLIT",
  INTERNAL: "INTERNAL",
};

export function normalizeNativeStatusCodeName(code: string): NativeSudachiErrorCode {
  return NATIVE_STATUS_CODE_MAP[code] ?? "UNKNOWN";
}
