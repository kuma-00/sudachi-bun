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
  readLookupResultLayout,
  readMorphemeResultLayout,
  readPosMatcherResultLayout,
  readPretokenizedResultLayout,
  readSentenceSpanResultLayout,
} from "./index.ts";

const PROJECT_ROOT = resolve(import.meta.dir, "..", "..");

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

const nativeLibraryPath = resolveNativeLibraryPath();
const dictPath = resolveDictionaryPath();
const canLoadCurrentNativeAbi = (() => {
  if (nativeLibraryPath === null) {
    return false;
  }

  try {
    const library = loadNativeLibrary({ libraryPath: nativeLibraryPath });
    library.close();
    return true;
  } catch {
    return false;
  }
})();

const nativeTest =
  nativeLibraryPath === null || !canLoadCurrentNativeAbi ? test.skip : test;
const dictTest =
  nativeLibraryPath === null || !canLoadCurrentNativeAbi || dictPath === null
    ? test.skip
    : test;

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
      expect(morphemeLayout.layoutVersion).toBe(1);
      expect(morphemeLayout.resultSize).toBeGreaterThan(0);
      expect([0, 1]).toContain(morphemeLayout.arrayLayoutKind);

      const posMatcherLayout = readPosMatcherResultLayout(tokenizerLibrary);
      expect(posMatcherLayout.layoutVersion).toBe(1);
      expect(posMatcherLayout.resultSize).toBeGreaterThan(0);
      expect([0, 1]).toContain(posMatcherLayout.arrayLayoutKind);

      const lookupLayout = readLookupResultLayout(lookupLibrary);
      expect(lookupLayout.layoutVersion).toBe(1);
      expect(lookupLayout.resultSize).toBeGreaterThan(0);
      expect([0, 1]).toContain(lookupLayout.arrayLayoutKind);

      const pretokenizedLayout =
        readPretokenizedResultLayout(pretokenizerLibrary);
      expect(pretokenizedLayout.layoutVersion).toBe(1);
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
