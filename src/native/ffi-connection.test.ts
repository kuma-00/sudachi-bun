import { suffix } from "bun:ffi";
import { expect, test } from "bun:test";
import { join, resolve } from "node:path";

import { createPretokenizer } from "../pretokenizer.ts";
import { createSentenceSplitter } from "../sentence-splitter.ts";
import { createSudachi } from "../sudachi.ts";
import { SudachiError } from "../types.ts";
import {
  loadLookupLibrary,
  loadNativeLibrary,
  loadPretokenizerLibrary,
  loadSentenceSplitterLibrary,
  readDictionaryInspectionResultLayout,
  readLookupResultLayout,
  readMorphemeResultLayout,
  readPosMatcherResultLayout,
  readPretokenizedResultLayout,
  readSentenceSpanResultLayout,
} from "./index.ts";

const PROJECT_ROOT = resolve(import.meta.dir, "..", "..");
// If these FFI integration tests fail due to missing symbols/library mismatch,
// rebuild the native library first:
//   cd sudachi-ffi && cargo build --release

function fileExists(path: string): boolean {
  const testBinary = Bun.which("test") ?? "/usr/bin/test";
  const result = Bun.spawnSync([testBinary, "-f", path], {
    stdout: "ignore",
    stderr: "ignore",
  });
  return result.exitCode === 0;
}

function resolveNativeLibraryPath(): string | null {
  const explicit = process.env.SUDACHI_FFI_PATH?.trim();
  if (explicit) {
    const resolved = resolve(explicit);
    return fileExists(resolved) ? resolved : null;
  }

  const candidates = [
    resolve(
      PROJECT_ROOT,
      "sudachi-ffi",
      "target",
      "release",
      `libsudachi_ffi.${suffix}`,
    ),
    resolve(
      PROJECT_ROOT,
      "sudachi-ffi",
      "target",
      "release",
      `sudachi_ffi.${suffix}`,
    ),
    resolve(
      PROJECT_ROOT,
      "sudachi-ffi",
      "target",
      "debug",
      `libsudachi_ffi.${suffix}`,
    ),
    resolve(
      PROJECT_ROOT,
      "sudachi-ffi",
      "target",
      "debug",
      `sudachi_ffi.${suffix}`,
    ),
  ];
  return candidates.find((path) => fileExists(path)) ?? null;
}

function resolveDictionaryPath(): string | null {
  const explicit =
    process.env.SUDACHI_TEST_DICT_PATH?.trim() ??
    process.env.SUDACHI_DICT_PATH?.trim() ??
    process.env.SUDACHI_DICTIONARY_PATH?.trim();
  if (explicit) {
    const resolved = resolve(explicit);
    return fileExists(resolved) ? resolved : null;
  }

  const defaultPath = join(PROJECT_ROOT, "dict", "system_core.dic");
  if (fileExists(defaultPath)) {
    return defaultPath;
  }

  try {
    const dictRoot = join(PROJECT_ROOT, "dict");
    const nestedCandidates = Array.from(
      new Bun.Glob("sudachi-dictionary-*/system_core.dic").scanSync({
        cwd: dictRoot,
        absolute: true,
      }),
    );
    nestedCandidates.sort((left, right) => right.localeCompare(left));
    const nested = nestedCandidates.find((path) => fileExists(path));
    return nested ?? null;
  } catch {
    return null;
  }
}

function requireResolvedPath(path: string | null, label: string): string {
  if (path === null) {
    throw new Error(`${label} is not resolved`);
  }

  return path;
}

function decodeDictionaryInspection(
  outResult: Uint8Array,
  layout: {
    kindOffset: number;
    headerVersionOffset: number;
    isLoadableOffset: number;
    kindUnknownValue: number;
    kindSystemValue: number;
    kindUserValue: number;
  },
): {
  dictionaryKind: "system" | "user" | "unknown";
  headerVersion: number | null;
  loadable: boolean;
} {
  const view = new DataView(
    outResult.buffer,
    outResult.byteOffset,
    outResult.byteLength,
  );
  const kind = view.getInt32(layout.kindOffset, true);
  const rawHeaderVersion = view.getInt32(layout.headerVersionOffset, true);
  const loadable = view.getInt32(layout.isLoadableOffset, true) !== 0;
  const headerVersion = rawHeaderVersion < 0 ? null : rawHeaderVersion;

  if (kind === layout.kindSystemValue) {
    return { dictionaryKind: "system", headerVersion, loadable };
  }

  if (kind === layout.kindUserValue) {
    return { dictionaryKind: "user", headerVersion, loadable };
  }

  return { dictionaryKind: "unknown", headerVersion, loadable };
}

const nativeLibraryPath = resolveNativeLibraryPath();
const dictPath = resolveDictionaryPath();
const nativeTest = test;
const dictTest = test;

nativeTest(
  "FFI: can load all native libraries and call common error/status symbols",
  () => {
    const options = {
      libraryPath: requireResolvedPath(nativeLibraryPath, "nativeLibraryPath"),
    };
    const tokenizerLibrary = loadNativeLibrary(options);
    const lookupLibrary = loadLookupLibrary(options);
    const pretokenizerLibrary = loadPretokenizerLibrary(options);
    const sentenceSplitterLibrary = loadSentenceSplitterLibrary(options);

    try {
      for (const library of [
        tokenizerLibrary,
        lookupLibrary,
        pretokenizerLibrary,
        sentenceSplitterLibrary,
      ]) {
        expect(typeof String(library.symbols.sudachi_get_last_error())).toBe(
          "string",
        );
        expect(typeof String(library.symbols.sudachi_status_code_name(0))).toBe(
          "string",
        );
      }
    } finally {
      sentenceSplitterLibrary.close();
      pretokenizerLibrary.close();
      lookupLibrary.close();
      tokenizerLibrary.close();
    }
  },
);

nativeTest(
  "FFI: can call sudachi_inspect_dictionary_bytes from the real native library",
  async () => {
    const options = {
      libraryPath: requireResolvedPath(nativeLibraryPath, "nativeLibraryPath"),
    };
    const library = loadNativeLibrary(options);

    try {
      const layout = readDictionaryInspectionResultLayout(library);

      const invalidBytes = new Uint8Array([1, 2, 3, 4]);
      const invalidResult = new Uint8Array(layout.resultSize);
      const invalidStatus = library.symbols.sudachi_inspect_dictionary_bytes(
        invalidBytes,
        invalidBytes.byteLength,
        invalidResult,
      );
      expect(invalidStatus).not.toBe(0);
      expect(
        String(library.symbols.sudachi_status_code_name(invalidStatus)),
      ).toBe("CONFIG");
      expect(decodeDictionaryInspection(invalidResult, layout)).toEqual({
        dictionaryKind: "unknown",
        headerVersion: null,
        loadable: false,
      });

      const resolvedDictPath = requireResolvedPath(dictPath, "dictPath");
      const dictionaryBytes = await Bun.file(resolvedDictPath).bytes();
      const okResult = new Uint8Array(layout.resultSize);
      const okStatus = library.symbols.sudachi_inspect_dictionary_bytes(
        dictionaryBytes,
        dictionaryBytes.byteLength,
        okResult,
      );
      expect(okStatus).toBe(0);
      const okInspection = decodeDictionaryInspection(okResult, layout);
      expect(okInspection.dictionaryKind).not.toBe("unknown");
      expect(typeof okInspection.headerVersion).toBe("number");
      expect(okInspection.loadable).toBe(true);
    } finally {
      library.close();
    }
  },
);

nativeTest(
  "FFI: can read all result layouts from the real native library",
  () => {
    const options = {
      libraryPath: requireResolvedPath(nativeLibraryPath, "nativeLibraryPath"),
    };
    const tokenizerLibrary = loadNativeLibrary(options);
    const lookupLibrary = loadLookupLibrary(options);
    const pretokenizerLibrary = loadPretokenizerLibrary(options);
    const sentenceSplitterLibrary = loadSentenceSplitterLibrary(options);

    try {
      const morphemeLayout = readMorphemeResultLayout(tokenizerLibrary);
      expect(morphemeLayout.layoutVersion).toBe(4);
      expect(morphemeLayout.resultSize).toBeGreaterThan(0);
      expect([0, 1]).toContain(morphemeLayout.arrayLayoutKind);

      const posMatcherLayout = readPosMatcherResultLayout(tokenizerLibrary);
      expect(posMatcherLayout.layoutVersion).toBe(1);
      expect(posMatcherLayout.resultSize).toBeGreaterThan(0);
      expect([0, 1]).toContain(posMatcherLayout.arrayLayoutKind);

      const lookupLayout = readLookupResultLayout(lookupLibrary);
      expect(lookupLayout.layoutVersion).toBe(2);
      expect(lookupLayout.resultSize).toBeGreaterThan(0);
      expect([0, 1]).toContain(lookupLayout.arrayLayoutKind);

      const pretokenizedLayout =
        readPretokenizedResultLayout(pretokenizerLibrary);
      expect(pretokenizedLayout.layoutVersion).toBe(2);
      expect(pretokenizedLayout.resultSize).toBeGreaterThan(0);
      expect([0, 1]).toContain(pretokenizedLayout.arrayLayoutKind);

      const sentenceSpanLayout = readSentenceSpanResultLayout(
        sentenceSplitterLibrary,
      );
      expect(sentenceSpanLayout.layoutVersion).toBe(1);
      expect(sentenceSpanLayout.resultSize).toBeGreaterThan(0);
      expect([0, 1]).toContain(sentenceSpanLayout.arrayLayoutKind);
    } finally {
      sentenceSplitterLibrary.close();
      pretokenizerLibrary.close();
      lookupLibrary.close();
      tokenizerLibrary.close();
    }
  },
);

nativeTest(
  "FFI: constructor APIs report nativeStatus when dictionary path is invalid",
  () => {
    const missingDictPath = resolve(PROJECT_ROOT, ".tmp", "missing-system.dic");
    const libraryPath = requireResolvedPath(
      nativeLibraryPath,
      "nativeLibraryPath",
    );

    expect(() =>
      createPretokenizer({
        dictPath: missingDictPath,
        libraryPath,
      }),
    ).toThrow(SudachiError);
    expect(() =>
      createSentenceSplitter({
        dictPath: missingDictPath,
        libraryPath,
      }),
    ).toThrow(SudachiError);

    try {
      createPretokenizer({
        dictPath: missingDictPath,
        libraryPath,
      });
      throw new Error("expected createPretokenizer to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(SudachiError);
      const sudachiError = error as SudachiError;
      expect(typeof sudachiError.message).toBe("string");
      expect(sudachiError.message.length).toBeGreaterThan(0);
      expect(sudachiError.nativeStatus).not.toBeNull();
    }

    try {
      createSentenceSplitter({
        dictPath: missingDictPath,
        libraryPath,
      });
      throw new Error("expected createSentenceSplitter to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(SudachiError);
      const sudachiError = error as SudachiError;
      expect(typeof sudachiError.message).toBe("string");
      expect(sudachiError.message.length).toBeGreaterThan(0);
      expect(sudachiError.nativeStatus).not.toBeNull();
    }
  },
);

dictTest(
  "FFI: createSudachi smoke test succeeds with a real dictionary",
  () => {
    const resolvedDictPath = requireResolvedPath(dictPath, "dictPath");
    const libraryPath = requireResolvedPath(
      nativeLibraryPath,
      "nativeLibraryPath",
    );
    const sudachi = createSudachi({
      dictPath: resolvedDictPath,
      libraryPath,
    });

    try {
      const tokens = sudachi.tokenizer.tokenize({
        text: "東京都に行く",
        projection: "surface",
        mode: "C",
      });
      expect(tokens.length).toBeGreaterThan(0);

      const lookupEntries = sudachi.tokenizer.lookup({
        surface: "東京",
        projection: "surface",
      });
      expect(Array.isArray(lookupEntries)).toBe(true);

      const sentenceSpans = sudachi.splitter.split(
        "今日は晴れです。明日も晴れです。",
      );
      expect(sentenceSpans.length).toBeGreaterThan(0);

      const pretokenized = sudachi.pretokenizer.pretokenize("東京タワー", {
        projection: "surface",
        mode: "C",
      });
      expect(pretokenized.length).toBeGreaterThan(0);
    } finally {
      sudachi.close();
    }
  },
);
