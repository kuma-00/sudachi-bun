import { expect, test } from "bun:test";

import { validateArrayLayout, readResultLayout } from "./core.ts";
import type { NativeErrorLibrary } from "../types.ts";

function createNativeErrorLibrary(errorText = "native layout error"): NativeErrorLibrary {
  return {
    symbols: {
      sudachi_lookup: () => 0,
      sudachi_lookup_subset: () => 0,
      sudachi_free_lookup_result: () => {},
      sudachi_get_lookup_result_layout: () => 0,
      sudachi_get_last_error: () => errorText as unknown as import("bun:ffi").CString,
      sudachi_status_code_name: () => "LOOKUP" as unknown as import("bun:ffi").CString,
    },
    close: () => {},
  };
}

test("validateArrayLayout rejects unsupported layout version", () => {
  expect(() => validateArrayLayout(2, 1, 8, 0, "test layout")).toThrow(
    "Unsupported test layout version: expected 1, received 2.",
  );
});

test("validateArrayLayout rejects invalid result size", () => {
  expect(() => validateArrayLayout(1, 1, 0, 0, "test layout")).toThrow(
    "Received an invalid test layout size.",
  );
});

test("validateArrayLayout rejects unsupported array layout kind", () => {
  expect(() => validateArrayLayout(1, 1, 8, 2, "test layout")).toThrow(
    "Unsupported test layout array layout kind: 2.",
  );
});

test("readResultLayout throws native SudachiError when layout reader returns non-zero status", () => {
  const library = createNativeErrorLibrary("native failure from ffi");

  expect(() =>
    readResultLayout(
      library,
      3,
      () => 9,
      "Failed to read test result layout.",
      (values) => ({
        layoutVersion: values[0] ?? 0,
      }),
      () => {},
    ),
  ).toThrow("native failure from ffi");
});

test("readResultLayout builds and validates using numeric layout values", () => {
  const library = createNativeErrorLibrary();

  const layout = readResultLayout(
    library,
    3,
    (outLayout) => {
      outLayout[0] = 1n;
      outLayout[1] = 8n;
      outLayout[2] = 16n;
      return 0;
    },
    "Failed to read test result layout.",
    (values) => ({
      layoutVersion: values[0] ?? 0,
      firstOffset: values[1] ?? 0,
      secondOffset: values[2] ?? 0,
    }),
    (value) => {
      validateArrayLayout(value.layoutVersion, 1, 1, 0, "test layout");
    },
  );

  expect(layout).toEqual({
    layoutVersion: 1,
    firstOffset: 8,
    secondOffset: 16,
  });
});
