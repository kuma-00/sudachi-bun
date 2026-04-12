import { expect, test } from "bun:test";

import type { NativePretokenizerLibrary } from "../types.ts";

import { createNativeSudachiError, readNativeError, readNativeStatusCodeName } from "./mapper.ts";

function createLibrary(options?: {
  errorValue?: unknown;
  statusCodeName?: unknown;
  throwOnGetLastError?: boolean;
  throwOnStatusCodeName?: boolean;
}): NativePretokenizerLibrary {
  return {
    symbols: {
      sudachi_create_pretokenizer: () => 0,
      sudachi_free_pretokenizer: () => {},
      sudachi_pretokenize: () => 0,
      sudachi_pretokenize_subset: () => 0,
      sudachi_free_pretokenized_result: () => {},
      sudachi_get_pretokenized_result_layout: () => 0,
      sudachi_get_last_error: () => {
        if (options?.throwOnGetLastError) {
          throw new Error("boom");
        }
        return (options?.errorValue ?? "native error") as import("bun:ffi").CString;
      },
      sudachi_status_code_name: () => {
        if (options?.throwOnStatusCodeName) {
          throw new Error("boom");
        }
        return (options?.statusCodeName ?? "TOKENIZE") as import("bun:ffi").CString;
      },
    },
    close: () => {},
  };
}

test("readNativeStatusCodeName accepts PRETOKENIZER alias", () => {
  expect(readNativeStatusCodeName(createLibrary({ statusCodeName: "PRETOKENIZER" }), 10)).toBe(
    "PRETOKENIZER",
  );
});

test("readNativeStatusCodeName falls back to UNKNOWN for unrecognized names", () => {
  expect(readNativeStatusCodeName(createLibrary({ statusCodeName: "NOPE" }), 1)).toBe("UNKNOWN");
});

test("readNativeStatusCodeName falls back to UNKNOWN when FFI call throws", () => {
  expect(readNativeStatusCodeName(createLibrary({ throwOnStatusCodeName: true }), 1)).toBe("UNKNOWN");
});

test("readNativeError returns empty string when FFI call throws", () => {
  expect(readNativeError(createLibrary({ throwOnGetLastError: true }))).toBe("");
});

test("createNativeSudachiError uses native message and preserves nativeStatus", () => {
  const error = createNativeSudachiError(createLibrary({ errorValue: "native failure" }), 5, "fallback");

  expect(error.message).toBe("native failure");
  expect(error.code).toBe("TOKENIZE");
  expect(error.nativeStatus).toBe(5);
});

test("createNativeSudachiError falls back to provided message when native error is empty", () => {
  const error = createNativeSudachiError(createLibrary({ errorValue: "" }), 7, "fallback message");

  expect(error.message).toBe("fallback message");
  expect(error.code).toBe("TOKENIZE");
  expect(error.nativeStatus).toBe(7);
});
