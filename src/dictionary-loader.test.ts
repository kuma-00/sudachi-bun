import { expect, spyOn, test } from "bun:test";

import { inspectDictionaryBytes } from "./dictionary-loader.ts";
import type { NativeSudachiLibrary } from "./native/types.ts";
import * as native from "./native.ts";
import { SudachiError } from "./types.ts";

function writeLayout(
  outLayout: BigUint64Array,
  values: readonly bigint[],
): number {
  values.forEach((value, index) => {
    outLayout[index] = value;
  });
  return 0;
}

function createMockLibrary(
  inspectImpl: NativeSudachiLibrary["symbols"]["sudachi_inspect_dictionary_bytes"],
): NativeSudachiLibrary {
  return {
    symbols: {
      sudachi_create_tokenizer: () => 0,
      sudachi_free_tokenizer: () => {},
      sudachi_create_stateful_tokenizer_from_tokenizer: () => 0,
      sudachi_free_stateful_tokenizer: () => {},
      sudachi_stateful_tokenizer_reset: () => 0,
      sudachi_stateful_tokenizer_set_mode: () => 0,
      sudachi_stateful_tokenizer_set_subset: () => 0,
      sudachi_stateful_tokenizer_do_tokenize: () => 0,
      sudachi_tokenize: () => 0,
      sudachi_tokenize_subset: () => 0,
      sudachi_split_morpheme: () => 0,
      sudachi_split_morphemes: () => 0,
      sudachi_compile_pos_matcher: () => 0,
      sudachi_inspect_dictionary_bytes: inspectImpl,
      sudachi_free_result: () => {},
      sudachi_free_pos_matcher_result: () => {},
      sudachi_get_morpheme_result_layout: () => 0,
      sudachi_get_dictionary_inspection_result_layout: (outLayout) =>
        writeLayout(outLayout as BigUint64Array, [
          1n,
          16n,
          4n,
          8n,
          12n,
          99n,
          7n,
          13n,
        ]),
      sudachi_get_pos_matcher_result_layout: () => 0,
      sudachi_get_last_error: () => "native error" as never,
      sudachi_status_code_name: () => "CONFIG" as never,
    },
    close: () => {},
  };
}

test("inspectDictionaryBytes decodes native inspection result", () => {
  const library = createMockLibrary((_bytes, _len, outResult) => {
    const out = outResult as Uint8Array;
    expect(out.byteLength).toBe(16);
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    view.setInt32(4, 7, true);
    view.setInt32(8, 2, true);
    view.setInt32(12, 1, true);
    return 0;
  });
  const loadSpy = spyOn(native, "loadNativeLibrary").mockReturnValue(library);
  const closeSpy = spyOn(library, "close");

  try {
    expect(inspectDictionaryBytes(new Uint8Array([1, 2, 3]))).toEqual({
      dictionaryKind: "system",
      headerVersion: 2,
      loadable: true,
    });
    expect(closeSpy).toHaveBeenCalledTimes(1);
  } finally {
    closeSpy.mockRestore();
    loadSpy.mockRestore();
  }
});

test("inspectDictionaryBytes returns inspection when native returns CONFIG failure", () => {
  const library = createMockLibrary((_bytes, _len, outResult) => {
    const out = outResult as Uint8Array;
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    view.setInt32(4, 13, true);
    view.setInt32(8, 7, true);
    view.setInt32(12, 0, true);
    return 4;
  });
  library.symbols.sudachi_get_last_error = () => "invalid dictionary" as never;
  library.symbols.sudachi_status_code_name = () => "CONFIG" as never;
  const loadSpy = spyOn(native, "loadNativeLibrary").mockReturnValue(library);
  const closeSpy = spyOn(library, "close");

  try {
    expect(inspectDictionaryBytes(new Uint8Array([0]))).toEqual({
      dictionaryKind: "user",
      headerVersion: 7,
      loadable: false,
    });
    expect(closeSpy).toHaveBeenCalledTimes(1);
  } finally {
    closeSpy.mockRestore();
    loadSpy.mockRestore();
  }
});

test("inspectDictionaryBytes throws SudachiError when native returns non-CONFIG failure", () => {
  const library = createMockLibrary((_bytes, _len, outResult) => {
    const out = outResult as Uint8Array;
    const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
    view.setInt32(4, 99, true);
    view.setInt32(8, -1, true);
    view.setInt32(12, 0, true);
    return 6;
  });
  library.symbols.sudachi_get_last_error = () => "internal failure" as never;
  library.symbols.sudachi_status_code_name = () => "INTERNAL_ERROR" as never;
  const loadSpy = spyOn(native, "loadNativeLibrary").mockReturnValue(library);
  const closeSpy = spyOn(library, "close");

  try {
    expect(() => inspectDictionaryBytes(new Uint8Array([0]))).toThrow(
      SudachiError,
    );
    expect(closeSpy).toHaveBeenCalledTimes(1);
  } finally {
    closeSpy.mockRestore();
    loadSpy.mockRestore();
  }
});

test("inspectDictionaryBytes rejects non-Uint8Array input", () => {
  expect(() => inspectDictionaryBytes("x" as unknown as Uint8Array)).toThrow(
    "bytes must be a Uint8Array.",
  );
});
