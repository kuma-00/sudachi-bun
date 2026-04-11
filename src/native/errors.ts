import type { NativeSudachiErrorCode } from "../types.ts";
import { SudachiError } from "../types.ts";

import type { NativeErrorLibrary } from "./types.ts";

export function readNativeError(library: NativeErrorLibrary): string {
  try {
    return String(library.symbols.sudachi_get_last_error() ?? "");
  } catch {
    return "";
  }
}

export function readNativeStatusCodeName(
  library: NativeErrorLibrary,
  status: number,
): NativeSudachiErrorCode {
  try {
    const code = String(library.symbols.sudachi_status_code_name(status) ?? "UNKNOWN");
    switch (code) {
      case "OK":
      case "NULL_POINTER":
      case "INVALID_UTF8":
      case "INVALID_MODE":
      case "INVALID_INDEX":
      case "CONFIG":
      case "TOKENIZE":
      case "SPLIT":
      case "LOOKUP":
      case "PRETOKENIZE":
      case "PRETOKENIZER":
      case "MORPHEME_SPLIT":
      case "SENTENCE_SPLIT":
      case "INTERNAL":
        return code;
      default:
        return "UNKNOWN";
    }
  } catch {
    return "UNKNOWN";
  }
}

export function createNativeSudachiError(
  library: NativeErrorLibrary,
  status: number,
  fallbackMessage: string,
): SudachiError {
  return new SudachiError(readNativeError(library) || fallbackMessage, {
    code: readNativeStatusCodeName(library, status),
    nativeStatus: status,
  });
}
