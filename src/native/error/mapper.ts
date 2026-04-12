import type { NativeSudachiErrorCode } from "../../types.ts";
import { SudachiError } from "../../types.ts";

import type { NativeErrorLibrary } from "../types.ts";

import { normalizeNativeStatusCodeName } from "./code-map.ts";

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
    const code = String(
      library.symbols.sudachi_status_code_name(status) ?? "UNKNOWN",
    );
    return normalizeNativeStatusCodeName(code);
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
