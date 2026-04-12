import type { CString, Pointer } from "bun:ffi";

export interface MorphemeResultLayout {
  layoutVersion: number;
  arrayLayoutKind: number;
  arrayItemsOffset: number;
  arrayLenOffset: number;
  resultSize: number;
  surfaceOffset: number;
  normalizedOffset: number;
  dictionaryFormOffset: number;
  readingOffset: number;
  posOffset: number;
  beginOffset: number;
  endOffset: number;
  beginCharOffset: number;
  endCharOffset: number;
  wordIdOffset: number;
  posIdOffset: number;
  dictionaryIdOffset: number;
  isOovOffset: number;
  synonymGroupIdsOffset: number;
  synonymGroupIdsLenOffset: number;
}

export interface SentenceSpanResultLayout {
  layoutVersion: number;
  arrayLayoutKind: number;
  arrayItemsOffset: number;
  arrayLenOffset: number;
  resultSize: number;
  startOffset: number;
  endOffset: number;
}

export interface LookupResultLayout {
  layoutVersion: number;
  arrayLayoutKind: number;
  arrayItemsOffset: number;
  arrayLenOffset: number;
  resultSize: number;
  surfaceOffset: number;
  posOffset: number;
  wordIdOffset: number;
  posIdOffset: number;
  dictionaryIdOffset: number;
  isOovOffset: number;
}

export interface PretokenizedResultLayout {
  layoutVersion: number;
  arrayLayoutKind: number;
  arrayItemsOffset: number;
  arrayLenOffset: number;
  resultSize: number;
  surfaceOffset: number;
  normalizedOffset: number;
  dictionaryFormOffset: number;
  readingOffset: number;
  posOffset: number;
  beginByteOffset: number;
  endByteOffset: number;
  beginCharOffset: number;
  endCharOffset: number;
  wordIdOffset: number;
  posIdOffset: number;
  dictionaryIdOffset: number;
  isOovOffset: number;
  synonymGroupIdsOffset: number;
  synonymGroupIdsLenOffset: number;
}

export interface PosMatcherResultLayout {
  layoutVersion: number;
  arrayLayoutKind: number;
  arrayItemsOffset: number;
  arrayLenOffset: number;
  resultSize: number;
}

export interface NativeSudachiLibrary {
  symbols: {
    sudachi_create_tokenizer: (
      configPath: string | null,
      resourceDir: string | null,
      dictPath: string,
      outHandle: NodeJS.TypedArray | Pointer | null,
    ) => number;
    sudachi_free_tokenizer: (
      handle: Pointer | NodeJS.TypedArray | null,
    ) => void;
    sudachi_create_stateful_tokenizer_from_tokenizer: (
      tokenizerHandle: Pointer | NodeJS.TypedArray | null,
      outHandle: NodeJS.TypedArray | Pointer | null,
    ) => number;
    sudachi_free_stateful_tokenizer: (
      handle: Pointer | NodeJS.TypedArray | null,
    ) => void;
    sudachi_stateful_tokenizer_reset: (
      handle: Pointer | NodeJS.TypedArray | null,
      inputUtf8: string,
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
    sudachi_free_pos_matcher_result: (
      result: Pointer | NodeJS.TypedArray | null,
    ) => void;
    sudachi_get_morpheme_result_layout: (
      outLayout: NodeJS.TypedArray | Pointer | null,
    ) => number;
    sudachi_get_pos_matcher_result_layout: (
      outLayout: NodeJS.TypedArray | Pointer | null,
    ) => number;
    sudachi_get_last_error: () => CString;
    sudachi_status_code_name: (status: number) => CString;
  };
  close(): void;
}

export interface NativeLookupLibrary {
  symbols: {
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
    sudachi_free_lookup_result: (
      result: Pointer | NodeJS.TypedArray | null,
    ) => void;
    sudachi_get_lookup_result_layout: (
      outLayout: NodeJS.TypedArray | Pointer | null,
    ) => number;
    sudachi_get_last_error: () => CString;
    sudachi_status_code_name: (status: number) => CString;
  };
  close(): void;
}

export interface NativePretokenizerLibrary {
  symbols: {
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
    sudachi_free_pretokenizer: (
      handle: Pointer | NodeJS.TypedArray | null,
    ) => void;
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
    sudachi_free_pretokenized_result: (
      result: Pointer | NodeJS.TypedArray | null,
    ) => void;
    sudachi_get_pretokenized_result_layout: (
      outLayout: NodeJS.TypedArray | Pointer | null,
    ) => number;
    sudachi_get_last_error: () => CString;
    sudachi_status_code_name: (status: number) => CString;
  };
  close(): void;
}

export interface NativeSentenceSplitterLibrary {
  symbols: {
    sudachi_create_sentence_splitter: (
      configPath: string | null,
      resourceDir: string | null,
      dictPath: string,
      outHandle: NodeJS.TypedArray | Pointer | null,
    ) => number;
    sudachi_free_sentence_splitter: (
      handle: Pointer | NodeJS.TypedArray | null,
    ) => void;
    sudachi_split_sentences: (
      handle: Pointer | NodeJS.TypedArray | null,
      inputUtf8: string,
      outResult: NodeJS.TypedArray | Pointer | null,
    ) => number;
    sudachi_free_sentence_spans: (
      result: Pointer | NodeJS.TypedArray | null,
    ) => void;
    sudachi_get_sentence_span_layout: (
      outLayout: NodeJS.TypedArray | Pointer | null,
    ) => number;
    sudachi_get_last_error: () => CString;
    sudachi_status_code_name: (status: number) => CString;
  };
  close(): void;
}

export type NativeErrorLibrary =
  | NativeLookupLibrary
  | NativePretokenizerLibrary
  | NativeSudachiLibrary
  | NativeSentenceSplitterLibrary;
