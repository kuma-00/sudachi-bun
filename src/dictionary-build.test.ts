import { CString, type Pointer, ptr, read } from "bun:ffi";
import { expect, spyOn, test } from "bun:test";

import {
  buildSystemDictionary,
  buildUserDictionary,
} from "./dictionary-build.ts";
import type { NativeSudachiLibrary } from "./native/types.ts";
import * as native from "./native.ts";
import { SudachiError } from "./types.ts";

interface DictionaryBuildTestEntry {
  part: string;
  size: number;
  elapsedMs: number;
  isWrite: boolean;
}

interface DictionaryBuildTestMemory {
  resultPtr: number;
  keepAlive: unknown[];
}

interface MockBuildSymbols {
  sudachi_build_system_dictionary: (
    matrixPath: string,
    lexiconPaths: Pointer,
    lexiconCount: number,
    outputPath: string,
    description: string | null,
    outReport: BigUint64Array,
  ) => number;
  sudachi_build_user_dictionary: (
    systemDictPath: string,
    lexiconPaths: Pointer,
    lexiconCount: number,
    outputPath: string,
    description: string | null,
    outReport: BigUint64Array,
  ) => number;
  sudachi_get_dictionary_build_report_layout: (
    outLayout: BigUint64Array,
  ) => number;
  sudachi_free_dictionary_build_report: (result: Pointer) => void;
}

function writeBuildReportMemory(
  entries: readonly DictionaryBuildTestEntry[],
): DictionaryBuildTestMemory {
  const keepAlive: unknown[] = [];
  const entrySize = 32;
  const itemBuffer = new ArrayBuffer(entrySize * entries.length);
  keepAlive.push(itemBuffer);
  const itemView = new DataView(itemBuffer);
  const encoder = new TextEncoder();

  for (const [index, entry] of entries.entries()) {
    const offset = index * entrySize;
    const encodedPart = encoder.encode(`${entry.part}\0`);
    keepAlive.push(encodedPart);
    itemView.setBigUint64(offset, BigInt(ptr(encodedPart)), true);
    itemView.setBigUint64(offset + 8, BigInt(entry.size), true);
    itemView.setBigUint64(offset + 16, BigInt(entry.elapsedMs), true);
    itemView.setUint8(offset + 24, Number(entry.isWrite));
  }

  const headerBuffer = new ArrayBuffer(16);
  keepAlive.push(headerBuffer);
  const headerView = new DataView(headerBuffer);
  headerView.setBigUint64(0, BigInt(ptr(itemBuffer)), true);
  headerView.setBigUint64(8, BigInt(entries.length), true);

  return {
    resultPtr: ptr(headerBuffer),
    keepAlive,
  };
}

function writeBuildReportLayout(outLayout: BigUint64Array): number {
  outLayout[0] = 1n;
  outLayout[1] = 0n;
  outLayout[2] = 0n;
  outLayout[3] = 8n;
  outLayout[4] = 32n;
  outLayout[5] = 0n;
  outLayout[6] = 8n;
  outLayout[7] = 16n;
  outLayout[8] = 24n;
  return 0;
}

function decodeLexiconPaths(ptrValue: Pointer, len: number): string[] {
  const paths = new Array<string>(len);
  for (let index = 0; index < len; index += 1) {
    const pathPtr = read.ptr(ptrValue, index * 8) as Pointer;
    paths[index] = String(new CString(pathPtr));
  }
  return paths;
}

function createMockLibrary(
  overrides: Partial<MockBuildSymbols> = {},
): NativeSudachiLibrary {
  const symbols = {
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
    sudachi_build_system_dictionary: () => 0,
    sudachi_build_user_dictionary: () => 0,
    sudachi_inspect_dictionary_bytes: () => 0,
    sudachi_free_result: () => {},
    sudachi_free_pos_matcher_result: () => {},
    sudachi_free_dictionary_build_report: () => {},
    sudachi_get_morpheme_result_layout: () => 0,
    sudachi_get_dictionary_inspection_result_layout: () => 0,
    sudachi_get_dictionary_build_report_layout: writeBuildReportLayout,
    sudachi_get_pos_matcher_result_layout: () => 0,
    sudachi_get_last_error: () =>
      "native error" as unknown as import("bun:ffi").CString,
    sudachi_status_code_name: () =>
      "INTERNAL" as unknown as import("bun:ffi").CString,
    ...overrides,
  } as unknown as NativeSudachiLibrary["symbols"];

  return {
    symbols,
    close: () => {},
  };
}

test("buildSystemDictionary decodes report and frees native report", () => {
  const memory = writeBuildReportMemory([
    { part: "matrix-load", size: 120, elapsedMs: 200, isWrite: false },
    { part: "lexicon-merge", size: 345, elapsedMs: 1500, isWrite: true },
  ]);
  let freedPointer = 0;
  void memory.keepAlive;

  const library = createMockLibrary({
    sudachi_build_system_dictionary: (
      matrixPath,
      lexiconPaths,
      lexiconCount,
      outputPath,
      description,
      outReport,
    ) => {
      expect(matrixPath).toBe("./matrix.def");
      expect(decodeLexiconPaths(lexiconPaths, lexiconCount)).toEqual([
        "./lex_a.csv",
        "./lex_b.csv",
      ]);
      expect(outputPath).toBe("./system.dic");
      expect(description).toBe("custom");
      outReport[0] = BigInt(memory.resultPtr);
      return 0;
    },
    sudachi_free_dictionary_build_report: (result) => {
      freedPointer = result;
    },
  });
  const loadSpy = spyOn(native, "loadNativeLibrary").mockReturnValue(library);
  const closeSpy = spyOn(library, "close");

  try {
    const result = buildSystemDictionary({
      matrixPath: "./matrix.def",
      lexiconPaths: ["./lex_a.csv", "./lex_b.csv"],
      outputPath: "./system.dic",
      description: "custom",
    });
    expect(result).toEqual({
      outputPath: "./system.dic",
      report: [
        { part: "matrix-load", size: 120, timeSeconds: 0.2, isWrite: false },
        { part: "lexicon-merge", size: 345, timeSeconds: 1.5, isWrite: true },
      ],
    });
    expect(freedPointer).toBe(memory.resultPtr);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  } finally {
    closeSpy.mockRestore();
    loadSpy.mockRestore();
  }
});

test("buildUserDictionary decodes report part names from native pointers", () => {
  const memory = writeBuildReportMemory([
    { part: "resolve-user", size: 10, elapsedMs: 1, isWrite: false },
    { part: "write-user", size: 11, elapsedMs: 2, isWrite: true },
  ]);
  void memory.keepAlive;

  const library = createMockLibrary({
    sudachi_build_user_dictionary: (
      systemDictPath,
      lexiconPaths,
      lexiconCount,
      outputPath,
      description,
      outReport,
    ) => {
      expect(systemDictPath).toBe("./system.dic");
      expect(decodeLexiconPaths(lexiconPaths, lexiconCount)).toEqual([
        "./user.csv",
      ]);
      expect(outputPath).toBe("./user.dic");
      expect(description).toBeNull();
      outReport[0] = BigInt(memory.resultPtr);
      return 0;
    },
  });
  const loadSpy = spyOn(native, "loadNativeLibrary").mockReturnValue(library);

  try {
    const result = buildUserDictionary({
      systemDictPath: "./system.dic",
      lexiconPaths: ["./user.csv"],
      outputPath: "./user.dic",
    });
    expect(result).toEqual({
      outputPath: "./user.dic",
      report: [
        { part: "resolve-user", size: 10, timeSeconds: 0.001, isWrite: false },
        { part: "write-user", size: 11, timeSeconds: 0.002, isWrite: true },
      ],
    });
  } finally {
    loadSpy.mockRestore();
  }
});

test("buildSystemDictionary converts native errors to SudachiError", () => {
  const library = createMockLibrary({
    sudachi_build_system_dictionary: () => 5,
  });
  library.symbols.sudachi_get_last_error = () =>
    "failed to build dictionary" as unknown as import("bun:ffi").CString;
  library.symbols.sudachi_status_code_name = () =>
    "CONFIG" as unknown as import("bun:ffi").CString;

  const loadSpy = spyOn(native, "loadNativeLibrary").mockReturnValue(library);
  try {
    expect(() =>
      buildSystemDictionary({
        matrixPath: "./matrix.def",
        lexiconPaths: ["./lex.csv"],
        outputPath: "./system.dic",
      }),
    ).toThrow(SudachiError);
  } finally {
    loadSpy.mockRestore();
  }
});

test("buildUserDictionary validates empty and invalid options", () => {
  expect(() =>
    buildUserDictionary({
      systemDictPath: "",
      lexiconPaths: ["./user.csv"],
      outputPath: "./user.dic",
    }),
  ).toThrow("systemDictPath must not be empty.");

  expect(() =>
    buildUserDictionary({
      systemDictPath: "./system.dic",
      lexiconPaths: [],
      outputPath: "./user.dic",
    }),
  ).toThrow("lexiconPaths must not be empty.");

  expect(() =>
    buildUserDictionary({
      systemDictPath: "./system.dic",
      lexiconPaths: ["./user.csv"],
      outputPath: " ",
    }),
  ).toThrow("outputPath must not be empty.");
});
