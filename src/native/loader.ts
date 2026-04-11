import { dlopen, type CString, type Pointer } from "bun:ffi";

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

interface NativeSymbols extends CommonNativeSymbols {
  sudachi_create_tokenizer: (
    configPath: string | null,
    resourceDir: string | null,
    dictPath: string,
    outHandle: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_free_tokenizer: (handle: Pointer | NodeJS.TypedArray | null) => void;
  sudachi_tokenize: (
    handle: Pointer | NodeJS.TypedArray | null,
    inputUtf8: string,
    mode: number,
    projection: number,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_tokenize_subset: (
    handle: Pointer | NodeJS.TypedArray | null,
    inputUtf8: string,
    mode: number,
    projection: number,
    subsetBits: number,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_split_morpheme: (
    handle: Pointer | NodeJS.TypedArray | null,
    inputUtf8: string,
    sourceMode: number,
    projection: number,
    morphemeIndex: number,
    splitMode: number,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_split_morphemes: (
    handle: Pointer | NodeJS.TypedArray | null,
    inputUtf8: string,
    sourceMode: number,
    projection: number,
    splitMode: number,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_compile_pos_matcher: (
    handle: Pointer | NodeJS.TypedArray | null,
    patternsJson: string,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_free_result: (result: Pointer | NodeJS.TypedArray | null) => void;
  sudachi_free_pos_matcher_result: (result: Pointer | NodeJS.TypedArray | null) => void;
  sudachi_get_morpheme_result_layout: (outLayout: NodeJS.TypedArray | Pointer | null) => number;
  sudachi_get_pos_matcher_result_layout: (outLayout: NodeJS.TypedArray | Pointer | null) => number;
}

interface NativeSentenceSplitterSymbols extends CommonNativeSymbols {
  sudachi_create_sentence_splitter: (
    configPath: string | null,
    resourceDir: string | null,
    dictPath: string,
    outHandle: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_free_sentence_splitter: (handle: Pointer | NodeJS.TypedArray | null) => void;
  sudachi_split_sentences: (
    handle: Pointer | NodeJS.TypedArray | null,
    inputUtf8: string,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_free_sentence_spans: (result: Pointer | NodeJS.TypedArray | null) => void;
  sudachi_get_sentence_span_layout: (outLayout: NodeJS.TypedArray | Pointer | null) => number;
}

interface NativeLookupSymbols extends CommonNativeSymbols {
  sudachi_lookup: (
    handle: Pointer | NodeJS.TypedArray | null,
    surface: string,
    projection: number,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_lookup_subset: (
    handle: Pointer | NodeJS.TypedArray | null,
    surface: string,
    projection: number,
    subsetBits: number,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_free_lookup_result: (result: Pointer | NodeJS.TypedArray | null) => void;
  sudachi_get_lookup_result_layout: (outLayout: NodeJS.TypedArray | Pointer | null) => number;
}

interface NativePretokenizerSymbols extends CommonNativeSymbols {
  sudachi_create_pretokenizer: (
    configPath: string | null,
    resourceDir: string | null,
    dictPath: string,
    outHandle: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_set_pretokenizer_debug?: (
    handle: Pointer | NodeJS.TypedArray | null,
    debug: number,
  ) => number;
  sudachi_free_pretokenizer: (handle: Pointer | NodeJS.TypedArray | null) => void;
  sudachi_pretokenize: (
    handle: Pointer | NodeJS.TypedArray | null,
    inputUtf8: string,
    mode: number,
    projection: number,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_pretokenize_subset: (
    handle: Pointer | NodeJS.TypedArray | null,
    inputUtf8: string,
    mode: number,
    projection: number,
    subsetBits: number,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_free_pretokenized_result: (result: Pointer | NodeJS.TypedArray | null) => void;
  sudachi_get_pretokenized_result_layout: (outLayout: NodeJS.TypedArray | Pointer | null) => number;
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

function loadLibrary<TSymbols, TLibrary, TSymbolDefinitions>(
  options: NativeLibraryLoadOptions,
  openLibrary: (libraryPath: string, symbolDefinitions: TSymbolDefinitions) => LoadedLibrary<TSymbols>,
  symbolDefinitions: TSymbolDefinitions,
  createLibrary: (symbols: TSymbols, close: () => void) => TLibrary,
): TLibrary {
  const libraryPath = loadNativeLibraryPath(options.libraryPath);
  const loaded = openLibrary(libraryPath, symbolDefinitions);
  return createLibrary(loaded.symbols, () => loaded.close());
}

export function createNativeSudachiLibrary(symbols: NativeSymbols, close: () => void): NativeSudachiLibrary {
  return {
    symbols: {
      sudachi_create_tokenizer: symbols.sudachi_create_tokenizer,
      sudachi_free_tokenizer: symbols.sudachi_free_tokenizer,
      sudachi_tokenize: symbols.sudachi_tokenize,
      sudachi_tokenize_subset: symbols.sudachi_tokenize_subset,
      sudachi_split_morpheme: symbols.sudachi_split_morpheme,
      sudachi_split_morphemes: symbols.sudachi_split_morphemes,
      sudachi_compile_pos_matcher: symbols.sudachi_compile_pos_matcher,
      sudachi_free_result: symbols.sudachi_free_result,
      sudachi_free_pos_matcher_result: symbols.sudachi_free_pos_matcher_result,
      sudachi_get_morpheme_result_layout: symbols.sudachi_get_morpheme_result_layout,
      sudachi_get_pos_matcher_result_layout: symbols.sudachi_get_pos_matcher_result_layout,
      sudachi_get_last_error: symbols.sudachi_get_last_error,
      sudachi_status_code_name: symbols.sudachi_status_code_name,
    },
    close,
  };
}

export function createNativeLookupLibrary(symbols: NativeLookupSymbols, close: () => void): NativeLookupLibrary {
  return {
    symbols: {
      sudachi_lookup: symbols.sudachi_lookup,
      sudachi_lookup_subset: symbols.sudachi_lookup_subset,
      sudachi_free_lookup_result: symbols.sudachi_free_lookup_result,
      sudachi_get_lookup_result_layout: symbols.sudachi_get_lookup_result_layout,
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
  return {
    symbols: {
      sudachi_create_pretokenizer: symbols.sudachi_create_pretokenizer,
      sudachi_set_pretokenizer_debug: symbols.sudachi_set_pretokenizer_debug,
      sudachi_free_pretokenizer: symbols.sudachi_free_pretokenizer,
      sudachi_pretokenize: symbols.sudachi_pretokenize,
      sudachi_pretokenize_subset: symbols.sudachi_pretokenize_subset,
      sudachi_free_pretokenized_result: symbols.sudachi_free_pretokenized_result,
      sudachi_get_pretokenized_result_layout: symbols.sudachi_get_pretokenized_result_layout,
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
  return {
    symbols: {
      sudachi_create_sentence_splitter: symbols.sudachi_create_sentence_splitter,
      sudachi_free_sentence_splitter: symbols.sudachi_free_sentence_splitter,
      sudachi_split_sentences: symbols.sudachi_split_sentences,
      sudachi_free_sentence_spans: symbols.sudachi_free_sentence_spans,
      sudachi_get_sentence_span_layout: symbols.sudachi_get_sentence_span_layout,
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
  return loadLibrary(options, openLibrary, TOKENIZER_NATIVE_SYMBOL_DEFS, createNativeSudachiLibrary);
}

export function loadLookupLibrary(
  options: NativeLibraryLoadOptions = {},
  openLibrary: NativeLookupLibraryLoader = dlopen as unknown as NativeLookupLibraryLoader,
): NativeLookupLibrary {
  return loadLibrary(options, openLibrary, LOOKUP_NATIVE_SYMBOL_DEFS, createNativeLookupLibrary);
}

export function loadPretokenizerLibrary(
  options: NativeLibraryLoadOptions = {},
  openLibrary: NativePretokenizerLibraryLoader = dlopen as unknown as NativePretokenizerLibraryLoader,
): NativePretokenizerLibrary {
  return loadLibrary(options, openLibrary, PRETOKENIZER_NATIVE_SYMBOL_DEFS, createNativePretokenizerLibrary);
}

export function loadSentenceSplitterLibrary(
  options: NativeLibraryLoadOptions = {},
  openLibrary: NativeSentenceSplitterLibraryLoader = dlopen as unknown as NativeSentenceSplitterLibraryLoader,
): NativeSentenceSplitterLibrary {
  return loadLibrary(
    options,
    openLibrary,
    SENTENCE_SPLITTER_NATIVE_SYMBOL_DEFS,
    createNativeSentenceSplitterLibrary,
  );
}
