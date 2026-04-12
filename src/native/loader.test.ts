import { expect, test } from "bun:test";
import { resolve } from "node:path";

import {
  loadLookupLibrary,
  loadNativeLibrary,
  loadPretokenizerLibrary,
  loadSentenceSplitterLibrary,
  type NativeLibraryLoader,
  type NativeLookupLibraryLoader,
  type NativePretokenizerLibraryLoader,
  type NativeSentenceSplitterLibraryLoader,
} from "./loader.ts";
import { LOOKUP_NATIVE_SYMBOL_DEFS } from "./symbols/lookup.ts";
import { PRETOKENIZER_NATIVE_SYMBOL_DEFS } from "./symbols/pretokenizer.ts";
import { SENTENCE_SPLITTER_NATIVE_SYMBOL_DEFS } from "./symbols/sentence-splitter.ts";
import { TOKENIZER_NATIVE_SYMBOL_DEFS } from "./symbols/tokenizer.ts";

test("loadNativeLibrary resolves path and passes tokenizer symbol defs to openLibrary", () => {
  const inputPath = "./fixtures/libsudachi_ffi.mock";
  const expectedPath = resolve(inputPath);
  let receivedPath = "";
  let receivedDefinitions: unknown;
  let closeCalls = 0;

  const openLibrary = ((libraryPath, symbolDefinitions) => {
    receivedPath = libraryPath;
    receivedDefinitions = symbolDefinitions;
    return {
      symbols: {} as never,
      close: () => {
        closeCalls += 1;
      },
    };
  }) as NativeLibraryLoader;

  const library = loadNativeLibrary({ libraryPath: inputPath }, openLibrary);

  expect(receivedPath).toBe(expectedPath);
  expect(receivedDefinitions).toBe(TOKENIZER_NATIVE_SYMBOL_DEFS);
  library.close();
  expect(closeCalls).toBe(1);
});

test("loadLookupLibrary resolves path and passes lookup symbol defs to openLibrary", () => {
  const inputPath = "./fixtures/libsudachi_ffi.mock";
  const expectedPath = resolve(inputPath);
  let receivedPath = "";
  let receivedDefinitions: unknown;
  let closeCalls = 0;

  const openLibrary = ((libraryPath, symbolDefinitions) => {
    receivedPath = libraryPath;
    receivedDefinitions = symbolDefinitions;
    return {
      symbols: {} as never,
      close: () => {
        closeCalls += 1;
      },
    };
  }) as NativeLookupLibraryLoader;

  const library = loadLookupLibrary({ libraryPath: inputPath }, openLibrary);

  expect(receivedPath).toBe(expectedPath);
  expect(receivedDefinitions).toBe(LOOKUP_NATIVE_SYMBOL_DEFS);
  library.close();
  expect(closeCalls).toBe(1);
});

test("loadPretokenizerLibrary resolves path and passes pretokenizer symbol defs to openLibrary", () => {
  const inputPath = "./fixtures/libsudachi_ffi.mock";
  const expectedPath = resolve(inputPath);
  let receivedPath = "";
  let receivedDefinitions: unknown;
  let closeCalls = 0;

  const openLibrary = ((libraryPath, symbolDefinitions) => {
    receivedPath = libraryPath;
    receivedDefinitions = symbolDefinitions;
    return {
      symbols: {} as never,
      close: () => {
        closeCalls += 1;
      },
    };
  }) as NativePretokenizerLibraryLoader;

  const library = loadPretokenizerLibrary(
    { libraryPath: inputPath },
    openLibrary,
  );

  expect(receivedPath).toBe(expectedPath);
  expect(receivedDefinitions).toBe(PRETOKENIZER_NATIVE_SYMBOL_DEFS);
  library.close();
  expect(closeCalls).toBe(1);
});

test("loadSentenceSplitterLibrary resolves path and passes sentence splitter symbol defs to openLibrary", () => {
  const inputPath = "./fixtures/libsudachi_ffi.mock";
  const expectedPath = resolve(inputPath);
  let receivedPath = "";
  let receivedDefinitions: unknown;
  let closeCalls = 0;

  const openLibrary = ((libraryPath, symbolDefinitions) => {
    receivedPath = libraryPath;
    receivedDefinitions = symbolDefinitions;
    return {
      symbols: {} as never,
      close: () => {
        closeCalls += 1;
      },
    };
  }) as NativeSentenceSplitterLibraryLoader;

  const library = loadSentenceSplitterLibrary(
    { libraryPath: inputPath },
    openLibrary,
  );

  expect(receivedPath).toBe(expectedPath);
  expect(receivedDefinitions).toBe(SENTENCE_SPLITTER_NATIVE_SYMBOL_DEFS);
  library.close();
  expect(closeCalls).toBe(1);
});
