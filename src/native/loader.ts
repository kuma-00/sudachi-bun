import { type CString, dlopen, type Pointer } from "bun:ffi";

import type { NativeLibraryLoadOptions } from "../types.ts";
import { loadNativeLibraryPath } from "./path-resolver.ts";
import { LOOKUP_NATIVE_SYMBOL_DEFS } from "./symbols/lookup.ts";
import { PRETOKENIZER_NATIVE_SYMBOL_DEFS } from "./symbols/pretokenizer.ts";
import { SENTENCE_SPLITTER_NATIVE_SYMBOL_DEFS } from "./symbols/sentence-splitter.ts";
import { TOKENIZER_NATIVE_SYMBOL_DEFS } from "./symbols/tokenizer.ts";
import type {
  NativeLookupLibrary,
  NativePretokenizerLibrary,
  NativeSentenceSplitterLibrary,
  NativeSudachiLibrary,
} from "./types.ts";

interface CommonNativeSymbols {
  sudachi_get_last_error: () => CString;
  sudachi_status_code_name: (status: number) => CString;
}

type NativeCStringArg = string | Uint8Array | null;

interface NativeSymbols extends CommonNativeSymbols {
  sudachi_create_tokenizer: (
    configPath: NativeCStringArg,
    resourceDir: NativeCStringArg,
    dictPath: NativeCStringArg,
    outHandle: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_free_tokenizer: (handle: Pointer | NodeJS.TypedArray | null) => void;
  sudachi_create_stateful_tokenizer_from_tokenizer: (
    tokenizerHandle: Pointer | NodeJS.TypedArray | null,
    outHandle: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_free_stateful_tokenizer: (
    handle: Pointer | NodeJS.TypedArray | null,
  ) => void;
  sudachi_stateful_tokenizer_reset: (
    handle: Pointer | NodeJS.TypedArray | null,
    inputUtf8: NativeCStringArg,
  ) => number;
  sudachi_stateful_tokenizer_set_mode: (
    handle: Pointer | NodeJS.TypedArray | null,
    mode: number,
  ) => number;
  sudachi_stateful_tokenizer_set_subset: (
    handle: Pointer | NodeJS.TypedArray | null,
    subsetBits: number,
  ) => number;
  sudachi_stateful_tokenizer_do_tokenize: (
    handle: Pointer | NodeJS.TypedArray | null,
    projection: number,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_tokenize: (
    handle: Pointer | NodeJS.TypedArray | null,
    inputUtf8: NativeCStringArg,
    mode: number,
    projection: number,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_tokenize_subset: (
    handle: Pointer | NodeJS.TypedArray | null,
    inputUtf8: NativeCStringArg,
    mode: number,
    projection: number,
    subsetBits: number,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_split_morpheme: (
    handle: Pointer | NodeJS.TypedArray | null,
    inputUtf8: NativeCStringArg,
    sourceMode: number,
    projection: number,
    morphemeIndex: number,
    splitMode: number,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_split_morphemes: (
    handle: Pointer | NodeJS.TypedArray | null,
    inputUtf8: NativeCStringArg,
    sourceMode: number,
    projection: number,
    splitMode: number,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_compile_pos_matcher: (
    handle: Pointer | NodeJS.TypedArray | null,
    patternsJson: NativeCStringArg,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_resolve_pos_id?: (
    handle: Pointer | NodeJS.TypedArray | null,
    posId: number,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_build_system_dictionary?: (
    matrixPath: NativeCStringArg,
    lexiconPaths: Pointer | NodeJS.TypedArray | null,
    lexiconPathsLen: number,
    outputPath: NativeCStringArg,
    description: NativeCStringArg,
    outReport: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_build_user_dictionary?: (
    systemDictPath: NativeCStringArg,
    lexiconPaths: Pointer | NodeJS.TypedArray | null,
    lexiconPathsLen: number,
    outputPath: NativeCStringArg,
    description: NativeCStringArg,
    outReport: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_inspect_dictionary_bytes: (
    bytesPtr: Pointer | NodeJS.TypedArray | null,
    bytesLen: number,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_free_result: (result: Pointer | NodeJS.TypedArray | null) => void;
  sudachi_free_pos_matcher_result: (
    result: Pointer | NodeJS.TypedArray | null,
  ) => void;
  sudachi_free_pos_tuple_result?: (
    result: Pointer | NodeJS.TypedArray | null,
  ) => void;
  sudachi_free_dictionary_build_report?: (
    report: Pointer | NodeJS.TypedArray | null,
  ) => void;
  sudachi_get_morpheme_result_layout: (
    outLayout: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_get_dictionary_inspection_result_layout: (
    outLayout: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_get_dictionary_build_report_layout?: (
    outLayout: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_get_pos_matcher_result_layout: (
    outLayout: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_get_pos_tuple_result_layout?: (
    outLayout: NodeJS.TypedArray | Pointer | null,
  ) => number;
}

interface NativeSentenceSplitterSymbols extends CommonNativeSymbols {
  sudachi_create_sentence_splitter: (
    configPath: NativeCStringArg,
    resourceDir: NativeCStringArg,
    dictPath: NativeCStringArg,
    outHandle: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_free_sentence_splitter: (
    handle: Pointer | NodeJS.TypedArray | null,
  ) => void;
  sudachi_split_sentences: (
    handle: Pointer | NodeJS.TypedArray | null,
    inputUtf8: NativeCStringArg,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_get_eos?: (
    handle: Pointer | NodeJS.TypedArray | null,
    inputUtf8: NativeCStringArg,
    outEos: NodeJS.TypedArray | Pointer | null,
    outFound: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_get_eos_with_limit?: (
    handle: Pointer | NodeJS.TypedArray | null,
    inputUtf8: NativeCStringArg,
    limit: number,
    outEos: NodeJS.TypedArray | Pointer | null,
    outFound: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_free_sentence_spans: (
    result: Pointer | NodeJS.TypedArray | null,
  ) => void;
  sudachi_get_sentence_span_layout: (
    outLayout: NodeJS.TypedArray | Pointer | null,
  ) => number;
}

interface NativeLookupSymbols extends CommonNativeSymbols {
  sudachi_lookup: (
    handle: Pointer | NodeJS.TypedArray | null,
    surface: NativeCStringArg,
    projection: number,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_lookup_subset: (
    handle: Pointer | NodeJS.TypedArray | null,
    surface: NativeCStringArg,
    projection: number,
    subsetBits: number,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_free_lookup_result: (
    result: Pointer | NodeJS.TypedArray | null,
  ) => void;
  sudachi_get_lookup_result_layout: (
    outLayout: NodeJS.TypedArray | Pointer | null,
  ) => number;
}

interface NativePretokenizerSymbols extends CommonNativeSymbols {
  sudachi_create_pretokenizer: (
    configPath: NativeCStringArg,
    resourceDir: NativeCStringArg,
    dictPath: NativeCStringArg,
    outHandle: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_set_pretokenizer_debug?: (
    handle: Pointer | NodeJS.TypedArray | null,
    debug: number,
  ) => number;
  sudachi_free_pretokenizer: (
    handle: Pointer | NodeJS.TypedArray | null,
  ) => void;
  sudachi_pretokenize: (
    handle: Pointer | NodeJS.TypedArray | null,
    inputUtf8: NativeCStringArg,
    mode: number,
    projection: number,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_pretokenize_subset: (
    handle: Pointer | NodeJS.TypedArray | null,
    inputUtf8: NativeCStringArg,
    mode: number,
    projection: number,
    subsetBits: number,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_free_pretokenized_result: (
    result: Pointer | NodeJS.TypedArray | null,
  ) => void;
  sudachi_get_pretokenized_result_layout: (
    outLayout: NodeJS.TypedArray | Pointer | null,
  ) => number;
}

export type NativeLibraryLoader = (
  libraryPath: string,
  symbolDefinitions: typeof TOKENIZER_NATIVE_SYMBOL_DEFS,
) => {
  symbols: NativeSymbols;
  close(): void;
};

export type NativeSentenceSplitterLibraryLoader = (
  libraryPath: string,
  symbolDefinitions: typeof SENTENCE_SPLITTER_NATIVE_SYMBOL_DEFS,
) => {
  symbols: NativeSentenceSplitterSymbols;
  close(): void;
};

export type NativeLookupLibraryLoader = (
  libraryPath: string,
  symbolDefinitions: typeof LOOKUP_NATIVE_SYMBOL_DEFS,
) => {
  symbols: NativeLookupSymbols;
  close(): void;
};

export type NativePretokenizerLibraryLoader = (
  libraryPath: string,
  symbolDefinitions: typeof PRETOKENIZER_NATIVE_SYMBOL_DEFS,
) => {
  symbols: NativePretokenizerSymbols;
  close(): void;
};

interface LoadedLibrary<TSymbols> {
  symbols: TSymbols;
  close(): void;
}

const CSTRING_ENCODER = new TextEncoder();

function toCStringPointer(value: string | null): Uint8Array | null {
  if (value === null) {
    return null;
  }

  return CSTRING_ENCODER.encode(`${value}\0`);
}

function loadLibrary<TSymbols, TLibrary, TSymbolDefinitions>(
  options: NativeLibraryLoadOptions,
  openLibrary: (
    libraryPath: string,
    symbolDefinitions: TSymbolDefinitions,
  ) => LoadedLibrary<TSymbols>,
  symbolDefinitions: TSymbolDefinitions,
  createLibrary: (symbols: TSymbols, close: () => void) => TLibrary,
): TLibrary {
  const libraryPath = loadNativeLibraryPath(options.libraryPath);
  const loaded = openLibrary(libraryPath, symbolDefinitions);
  return createLibrary(loaded.symbols, () => loaded.close());
}

export function createNativeSudachiLibrary(
  symbols: NativeSymbols,
  close: () => void,
): NativeSudachiLibrary {
  const toNativeCString = (value: string | null): NativeCStringArg => value;
  const buildSystemDictionary = symbols.sudachi_build_system_dictionary;
  const buildUserDictionary = symbols.sudachi_build_user_dictionary;

  return {
    symbols: {
      sudachi_create_tokenizer: (
        configPath,
        resourceDir,
        dictPath,
        outHandle,
      ) =>
        symbols.sudachi_create_tokenizer(
          toNativeCString(configPath),
          toNativeCString(resourceDir),
          toNativeCString(dictPath),
          outHandle,
        ),
      sudachi_free_tokenizer: symbols.sudachi_free_tokenizer,
      sudachi_create_stateful_tokenizer_from_tokenizer: (
        tokenizerHandle,
        outHandle,
      ) =>
        symbols.sudachi_create_stateful_tokenizer_from_tokenizer(
          tokenizerHandle,
          outHandle,
        ),
      sudachi_free_stateful_tokenizer: symbols.sudachi_free_stateful_tokenizer,
      sudachi_stateful_tokenizer_reset: (handle, inputUtf8) =>
        symbols.sudachi_stateful_tokenizer_reset(
          handle,
          toNativeCString(inputUtf8),
        ),
      sudachi_stateful_tokenizer_set_mode:
        symbols.sudachi_stateful_tokenizer_set_mode,
      sudachi_stateful_tokenizer_set_subset:
        symbols.sudachi_stateful_tokenizer_set_subset,
      sudachi_stateful_tokenizer_do_tokenize:
        symbols.sudachi_stateful_tokenizer_do_tokenize,
      sudachi_tokenize: (handle, inputUtf8, mode, projection, outResult) =>
        symbols.sudachi_tokenize(
          handle,
          toNativeCString(inputUtf8),
          mode,
          projection,
          outResult,
        ),
      sudachi_tokenize_subset: (
        handle,
        inputUtf8,
        mode,
        projection,
        subsetBits,
        outResult,
      ) =>
        symbols.sudachi_tokenize_subset(
          handle,
          toNativeCString(inputUtf8),
          mode,
          projection,
          subsetBits,
          outResult,
        ),
      sudachi_split_morpheme: (
        handle,
        inputUtf8,
        sourceMode,
        projection,
        morphemeIndex,
        splitMode,
        outResult,
      ) =>
        symbols.sudachi_split_morpheme(
          handle,
          toNativeCString(inputUtf8),
          sourceMode,
          projection,
          morphemeIndex,
          splitMode,
          outResult,
        ),
      sudachi_split_morphemes: (
        handle,
        inputUtf8,
        sourceMode,
        projection,
        splitMode,
        outResult,
      ) =>
        symbols.sudachi_split_morphemes(
          handle,
          toNativeCString(inputUtf8),
          sourceMode,
          projection,
          splitMode,
          outResult,
        ),
      sudachi_compile_pos_matcher: (handle, patternsJson, outResult) =>
        symbols.sudachi_compile_pos_matcher(
          handle,
          toNativeCString(patternsJson),
          outResult,
        ),
      sudachi_resolve_pos_id: symbols.sudachi_resolve_pos_id
        ? (handle, posId, outResult) =>
            symbols.sudachi_resolve_pos_id?.(handle, posId, outResult) ?? -1
        : undefined,
      sudachi_build_system_dictionary: buildSystemDictionary
        ? (
            matrixPath,
            lexiconPaths,
            lexiconPathsLen,
            outputPath,
            description,
            outReport,
          ) =>
            buildSystemDictionary(
              toNativeCString(matrixPath),
              lexiconPaths,
              lexiconPathsLen,
              toNativeCString(outputPath),
              toNativeCString(description),
              outReport,
            )
        : undefined,
      sudachi_build_user_dictionary: buildUserDictionary
        ? (
            systemDictPath,
            lexiconPaths,
            lexiconPathsLen,
            outputPath,
            description,
            outReport,
          ) =>
            buildUserDictionary(
              toNativeCString(systemDictPath),
              lexiconPaths,
              lexiconPathsLen,
              toNativeCString(outputPath),
              toNativeCString(description),
              outReport,
            )
        : undefined,
      sudachi_inspect_dictionary_bytes: (bytesPtr, bytesLen, outResult) =>
        symbols.sudachi_inspect_dictionary_bytes(bytesPtr, bytesLen, outResult),
      sudachi_free_result: symbols.sudachi_free_result,
      sudachi_free_pos_matcher_result: symbols.sudachi_free_pos_matcher_result,
      sudachi_free_pos_tuple_result: symbols.sudachi_free_pos_tuple_result,
      sudachi_free_dictionary_build_report:
        symbols.sudachi_free_dictionary_build_report,
      sudachi_get_morpheme_result_layout:
        symbols.sudachi_get_morpheme_result_layout,
      sudachi_get_dictionary_inspection_result_layout:
        symbols.sudachi_get_dictionary_inspection_result_layout,
      sudachi_get_dictionary_build_report_layout:
        symbols.sudachi_get_dictionary_build_report_layout,
      sudachi_get_pos_matcher_result_layout:
        symbols.sudachi_get_pos_matcher_result_layout,
      sudachi_get_pos_tuple_result_layout:
        symbols.sudachi_get_pos_tuple_result_layout,
      sudachi_get_last_error: symbols.sudachi_get_last_error,
      sudachi_status_code_name: symbols.sudachi_status_code_name,
    },
    close,
  };
}

export function createNativeLookupLibrary(
  symbols: NativeLookupSymbols,
  close: () => void,
): NativeLookupLibrary {
  const toNativeCString = (value: string): NativeCStringArg => value;

  return {
    symbols: {
      sudachi_lookup: (handle, surface, projection, outResult) =>
        symbols.sudachi_lookup(
          handle,
          toNativeCString(surface),
          projection,
          outResult,
        ),
      sudachi_lookup_subset: (
        handle,
        surface,
        projection,
        subsetBits,
        outResult,
      ) =>
        symbols.sudachi_lookup_subset(
          handle,
          toNativeCString(surface),
          projection,
          subsetBits,
          outResult,
        ),
      sudachi_free_lookup_result: symbols.sudachi_free_lookup_result,
      sudachi_get_lookup_result_layout:
        symbols.sudachi_get_lookup_result_layout,
      sudachi_get_last_error: symbols.sudachi_get_last_error,
      sudachi_status_code_name: symbols.sudachi_status_code_name,
    },
    close,
  };
}

export function createNativePretokenizerLibrary(
  symbols: NativePretokenizerSymbols,
  close: () => void,
): NativePretokenizerLibrary {
  const toNativeCString = (value: string | null): NativeCStringArg => value;

  return {
    symbols: {
      sudachi_create_pretokenizer: (
        configPath,
        resourceDir,
        dictPath,
        outHandle,
      ) =>
        symbols.sudachi_create_pretokenizer(
          toNativeCString(configPath),
          toNativeCString(resourceDir),
          toNativeCString(dictPath),
          outHandle,
        ),
      sudachi_set_pretokenizer_debug: symbols.sudachi_set_pretokenizer_debug,
      sudachi_free_pretokenizer: symbols.sudachi_free_pretokenizer,
      sudachi_pretokenize: (handle, inputUtf8, mode, projection, outResult) =>
        symbols.sudachi_pretokenize(
          handle,
          toNativeCString(inputUtf8),
          mode,
          projection,
          outResult,
        ),
      sudachi_pretokenize_subset: (
        handle,
        inputUtf8,
        mode,
        projection,
        subsetBits,
        outResult,
      ) =>
        symbols.sudachi_pretokenize_subset(
          handle,
          toNativeCString(inputUtf8),
          mode,
          projection,
          subsetBits,
          outResult,
        ),
      sudachi_free_pretokenized_result:
        symbols.sudachi_free_pretokenized_result,
      sudachi_get_pretokenized_result_layout:
        symbols.sudachi_get_pretokenized_result_layout,
      sudachi_get_last_error: symbols.sudachi_get_last_error,
      sudachi_status_code_name: symbols.sudachi_status_code_name,
    },
    close,
  };
}

export function createNativeSentenceSplitterLibrary(
  symbols: NativeSentenceSplitterSymbols,
  close: () => void,
): NativeSentenceSplitterLibrary {
  const toNativeCString = (value: string | null): NativeCStringArg => value;
  const getEos = symbols.sudachi_get_eos;
  const getEosWithLimit = symbols.sudachi_get_eos_with_limit;

  return {
    symbols: {
      sudachi_create_sentence_splitter: (
        configPath,
        resourceDir,
        dictPath,
        outHandle,
      ) =>
        symbols.sudachi_create_sentence_splitter(
          toNativeCString(configPath),
          toNativeCString(resourceDir),
          toNativeCString(dictPath),
          outHandle,
        ),
      sudachi_free_sentence_splitter: symbols.sudachi_free_sentence_splitter,
      sudachi_split_sentences: (handle, inputUtf8, outResult) =>
        symbols.sudachi_split_sentences(
          handle,
          toNativeCString(inputUtf8),
          outResult,
        ),
      sudachi_get_eos: getEos
        ? (handle, inputUtf8, outEos, outFound) => {
            return getEos(handle, toNativeCString(inputUtf8), outEos, outFound);
          }
        : undefined,
      sudachi_get_eos_with_limit: getEosWithLimit
        ? (handle, inputUtf8, limit, outEos, outFound) => {
            return getEosWithLimit(
              handle,
              toNativeCString(inputUtf8),
              limit,
              outEos,
              outFound,
            );
          }
        : undefined,
      sudachi_free_sentence_spans: symbols.sudachi_free_sentence_spans,
      sudachi_get_sentence_span_layout:
        symbols.sudachi_get_sentence_span_layout,
      sudachi_get_last_error: symbols.sudachi_get_last_error,
      sudachi_status_code_name: symbols.sudachi_status_code_name,
    },
    close,
  };
}

export function loadNativeLibrary(
  options: NativeLibraryLoadOptions = {},
  openLibrary: NativeLibraryLoader = dlopen as unknown as NativeLibraryLoader,
): NativeSudachiLibrary {
  return loadLibrary(
    options,
    openLibrary,
    TOKENIZER_NATIVE_SYMBOL_DEFS,
    createNativeSudachiLibraryWithCStringEncoding,
  );
}

export function loadLookupLibrary(
  options: NativeLibraryLoadOptions = {},
  openLibrary: NativeLookupLibraryLoader = dlopen as unknown as NativeLookupLibraryLoader,
): NativeLookupLibrary {
  return loadLibrary(
    options,
    openLibrary,
    LOOKUP_NATIVE_SYMBOL_DEFS,
    createNativeLookupLibraryWithCStringEncoding,
  );
}

export function loadPretokenizerLibrary(
  options: NativeLibraryLoadOptions = {},
  openLibrary: NativePretokenizerLibraryLoader = dlopen as unknown as NativePretokenizerLibraryLoader,
): NativePretokenizerLibrary {
  return loadLibrary(
    options,
    openLibrary,
    PRETOKENIZER_NATIVE_SYMBOL_DEFS,
    createNativePretokenizerLibraryWithCStringEncoding,
  );
}

export function loadSentenceSplitterLibrary(
  options: NativeLibraryLoadOptions = {},
  openLibrary: NativeSentenceSplitterLibraryLoader = dlopen as unknown as NativeSentenceSplitterLibraryLoader,
): NativeSentenceSplitterLibrary {
  return loadLibrary(
    options,
    openLibrary,
    SENTENCE_SPLITTER_NATIVE_SYMBOL_DEFS,
    createNativeSentenceSplitterLibraryWithCStringEncoding,
  );
}

function createNativeSudachiLibraryWithCStringEncoding(
  symbols: NativeSymbols,
  close: () => void,
): NativeSudachiLibrary {
  const buildSystemDictionary = symbols.sudachi_build_system_dictionary;
  const buildUserDictionary = symbols.sudachi_build_user_dictionary;

  return {
    symbols: {
      ...createNativeSudachiLibrary(symbols, close).symbols,
      sudachi_create_tokenizer: (
        configPath,
        resourceDir,
        dictPath,
        outHandle,
      ) =>
        symbols.sudachi_create_tokenizer(
          toCStringPointer(configPath),
          toCStringPointer(resourceDir),
          toCStringPointer(dictPath),
          outHandle,
        ),
      sudachi_stateful_tokenizer_reset: (handle, inputUtf8) =>
        symbols.sudachi_stateful_tokenizer_reset(
          handle,
          toCStringPointer(inputUtf8),
        ),
      sudachi_tokenize: (handle, inputUtf8, mode, projection, outResult) =>
        symbols.sudachi_tokenize(
          handle,
          toCStringPointer(inputUtf8),
          mode,
          projection,
          outResult,
        ),
      sudachi_tokenize_subset: (
        handle,
        inputUtf8,
        mode,
        projection,
        subsetBits,
        outResult,
      ) =>
        symbols.sudachi_tokenize_subset(
          handle,
          toCStringPointer(inputUtf8),
          mode,
          projection,
          subsetBits,
          outResult,
        ),
      sudachi_split_morpheme: (
        handle,
        inputUtf8,
        sourceMode,
        projection,
        morphemeIndex,
        splitMode,
        outResult,
      ) =>
        symbols.sudachi_split_morpheme(
          handle,
          toCStringPointer(inputUtf8),
          sourceMode,
          projection,
          morphemeIndex,
          splitMode,
          outResult,
        ),
      sudachi_split_morphemes: (
        handle,
        inputUtf8,
        sourceMode,
        projection,
        splitMode,
        outResult,
      ) =>
        symbols.sudachi_split_morphemes(
          handle,
          toCStringPointer(inputUtf8),
          sourceMode,
          projection,
          splitMode,
          outResult,
        ),
      sudachi_compile_pos_matcher: (handle, patternsJson, outResult) =>
        symbols.sudachi_compile_pos_matcher(
          handle,
          toCStringPointer(patternsJson),
          outResult,
        ),
      sudachi_build_system_dictionary: buildSystemDictionary
        ? (
            matrixPath,
            lexiconPaths,
            lexiconPathsLen,
            outputPath,
            description,
            outReport,
          ) =>
            buildSystemDictionary(
              toCStringPointer(matrixPath),
              lexiconPaths,
              lexiconPathsLen,
              toCStringPointer(outputPath),
              toCStringPointer(description),
              outReport,
            )
        : undefined,
      sudachi_build_user_dictionary: buildUserDictionary
        ? (
            systemDictPath,
            lexiconPaths,
            lexiconPathsLen,
            outputPath,
            description,
            outReport,
          ) =>
            buildUserDictionary(
              toCStringPointer(systemDictPath),
              lexiconPaths,
              lexiconPathsLen,
              toCStringPointer(outputPath),
              toCStringPointer(description),
              outReport,
            )
        : undefined,
    },
    close,
  };
}

function createNativeLookupLibraryWithCStringEncoding(
  symbols: NativeLookupSymbols,
  close: () => void,
): NativeLookupLibrary {
  return {
    symbols: {
      ...createNativeLookupLibrary(symbols, close).symbols,
      sudachi_lookup: (handle, surface, projection, outResult) =>
        symbols.sudachi_lookup(
          handle,
          toCStringPointer(surface),
          projection,
          outResult,
        ),
      sudachi_lookup_subset: (
        handle,
        surface,
        projection,
        subsetBits,
        outResult,
      ) =>
        symbols.sudachi_lookup_subset(
          handle,
          toCStringPointer(surface),
          projection,
          subsetBits,
          outResult,
        ),
    },
    close,
  };
}

function createNativePretokenizerLibraryWithCStringEncoding(
  symbols: NativePretokenizerSymbols,
  close: () => void,
): NativePretokenizerLibrary {
  return {
    symbols: {
      ...createNativePretokenizerLibrary(symbols, close).symbols,
      sudachi_create_pretokenizer: (
        configPath,
        resourceDir,
        dictPath,
        outHandle,
      ) =>
        symbols.sudachi_create_pretokenizer(
          toCStringPointer(configPath),
          toCStringPointer(resourceDir),
          toCStringPointer(dictPath),
          outHandle,
        ),
      sudachi_pretokenize: (handle, inputUtf8, mode, projection, outResult) =>
        symbols.sudachi_pretokenize(
          handle,
          toCStringPointer(inputUtf8),
          mode,
          projection,
          outResult,
        ),
      sudachi_pretokenize_subset: (
        handle,
        inputUtf8,
        mode,
        projection,
        subsetBits,
        outResult,
      ) =>
        symbols.sudachi_pretokenize_subset(
          handle,
          toCStringPointer(inputUtf8),
          mode,
          projection,
          subsetBits,
          outResult,
        ),
    },
    close,
  };
}

function createNativeSentenceSplitterLibraryWithCStringEncoding(
  symbols: NativeSentenceSplitterSymbols,
  close: () => void,
): NativeSentenceSplitterLibrary {
  const getEos = symbols.sudachi_get_eos;
  const getEosWithLimit = symbols.sudachi_get_eos_with_limit;

  return {
    symbols: {
      ...createNativeSentenceSplitterLibrary(symbols, close).symbols,
      sudachi_create_sentence_splitter: (
        configPath,
        resourceDir,
        dictPath,
        outHandle,
      ) =>
        symbols.sudachi_create_sentence_splitter(
          toCStringPointer(configPath),
          toCStringPointer(resourceDir),
          toCStringPointer(dictPath),
          outHandle,
        ),
      sudachi_split_sentences: (handle, inputUtf8, outResult) =>
        symbols.sudachi_split_sentences(
          handle,
          toCStringPointer(inputUtf8),
          outResult,
        ),
      sudachi_get_eos: getEos
        ? (handle, inputUtf8, outEos, outFound) => {
            return getEos(
              handle,
              toCStringPointer(inputUtf8),
              outEos,
              outFound,
            );
          }
        : undefined,
      sudachi_get_eos_with_limit: getEosWithLimit
        ? (handle, inputUtf8, limit, outEos, outFound) => {
            return getEosWithLimit(
              handle,
              toCStringPointer(inputUtf8),
              limit,
              outEos,
              outFound,
            );
          }
        : undefined,
    },
    close,
  };
}
