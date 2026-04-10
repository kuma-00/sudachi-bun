import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dlopen, suffix, type CString, type Pointer } from "bun:ffi";

import type { NativeLibraryLoadOptions, NativeSudachiErrorCode } from "./types.ts";
import { SudachiError } from "./types.ts";

const MORPHEME_RESULT_LAYOUT_FIELD_COUNT = 18;
const LOOKUP_RESULT_LAYOUT_FIELD_COUNT = 11;
const POS_MATCHER_RESULT_LAYOUT_FIELD_COUNT = 5;
const SENTENCE_SPAN_RESULT_LAYOUT_FIELD_COUNT = 7;

export const MORPHEME_RESULT_LAYOUT_VERSION = 1;
export const LOOKUP_RESULT_LAYOUT_VERSION = 2;
export const POS_MATCHER_RESULT_LAYOUT_VERSION = 1;
export const SENTENCE_SPAN_RESULT_LAYOUT_VERSION = 1;

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
    sudachi_free_tokenizer: (handle: Pointer | NodeJS.TypedArray | null) => void;
    sudachi_tokenize: (
      handle: Pointer | NodeJS.TypedArray | null,
      inputUtf8: string,
      mode: number,
      outResult: NodeJS.TypedArray | Pointer | null,
    ) => number;
    sudachi_tokenize_subset: (
      handle: Pointer | NodeJS.TypedArray | null,
      inputUtf8: string,
      mode: number,
      subsetBits: number,
      outResult: NodeJS.TypedArray | Pointer | null,
    ) => number;
    sudachi_split_morpheme: (
      handle: Pointer | NodeJS.TypedArray | null,
      inputUtf8: string,
      sourceMode: number,
      morphemeIndex: number,
      splitMode: number,
      outResult: NodeJS.TypedArray | Pointer | null,
    ) => number;
    sudachi_split_morphemes: (
      handle: Pointer | NodeJS.TypedArray | null,
      inputUtf8: string,
      sourceMode: number,
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
      outResult: NodeJS.TypedArray | Pointer | null,
    ) => number;
    sudachi_free_lookup_result: (result: Pointer | NodeJS.TypedArray | null) => void;
    sudachi_get_lookup_result_layout: (outLayout: NodeJS.TypedArray | Pointer | null) => number;
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
    sudachi_free_sentence_splitter: (handle: Pointer | NodeJS.TypedArray | null) => void;
    sudachi_split_sentences: (
      handle: Pointer | NodeJS.TypedArray | null,
      inputUtf8: string,
      outResult: NodeJS.TypedArray | Pointer | null,
    ) => number;
    sudachi_free_sentence_spans: (result: Pointer | NodeJS.TypedArray | null) => void;
    sudachi_get_sentence_span_layout: (outLayout: NodeJS.TypedArray | Pointer | null) => number;
    sudachi_get_last_error: () => CString;
    sudachi_status_code_name: (status: number) => CString;
  };
  close(): void;
}

interface CommonNativeSymbols {
  sudachi_get_last_error: () => CString;
  sudachi_status_code_name: (status: number) => CString;
}

type NativeErrorLibrary = NativeLookupLibrary | NativeSudachiLibrary | NativeSentenceSplitterLibrary;

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
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_tokenize_subset: (
    handle: Pointer | NodeJS.TypedArray | null,
    inputUtf8: string,
    mode: number,
    subsetBits: number,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_split_morpheme: (
    handle: Pointer | NodeJS.TypedArray | null,
    inputUtf8: string,
    sourceMode: number,
    morphemeIndex: number,
    splitMode: number,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_split_morphemes: (
    handle: Pointer | NodeJS.TypedArray | null,
    inputUtf8: string,
    sourceMode: number,
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
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_lookup_subset: (
    handle: Pointer | NodeJS.TypedArray | null,
    surface: string,
    subsetBits: number,
    outResult: NodeJS.TypedArray | Pointer | null,
  ) => number;
  sudachi_free_lookup_result: (result: Pointer | NodeJS.TypedArray | null) => void;
  sudachi_get_lookup_result_layout: (outLayout: NodeJS.TypedArray | Pointer | null) => number;
}

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(MODULE_DIR, "../..");

function loadNativeLibraryPath(libraryPath?: string): string {
  const explicitPath = libraryPath?.trim() || process.env.SUDACHI_FFI_PATH?.trim();
  if (explicitPath) {
    return resolve(explicitPath);
  }

  const explicitDir = process.env.SUDACHI_FFI_DIR?.trim();
  const searchDirs = [
    explicitDir ? resolve(explicitDir) : resolve(PROJECT_ROOT, "sudachi-ffi", "target", "release"),
    resolve(PROJECT_ROOT, "sudachi-ffi", "target", "debug"),
  ];
  const candidateNames = [`libsudachi_ffi.${suffix}`, `sudachi_ffi.${suffix}`];

  for (const dir of searchDirs) {
    for (const candidateName of candidateNames) {
      const candidatePath = join(dir, candidateName);
      if (existsSync(candidatePath)) {
        return candidatePath;
      }
    }
  }

  const formattedCandidates = searchDirs
    .flatMap((dir) => candidateNames.map((name) => join(dir, name)))
    .join("\n  - ");

  throw new Error(
    [
      "Could not find the Sudachi native library.",
      "Build it first with `cd sudachi-ffi && cargo build --release`.",
      "Looked in:",
      `  - ${formattedCandidates}`,
    ].join("\n"),
  );
}

function validateArrayLayout(
  layoutVersion: number,
  expectedVersion: number,
  resultSize: number,
  arrayLayoutKind: number,
  label: string,
): void {
  if (layoutVersion !== expectedVersion) {
    throw new SudachiError(
      `Unsupported ${label} version: expected ${expectedVersion}, received ${layoutVersion}.`,
      { code: "LAYOUT_MISMATCH" },
    );
  }

  if (resultSize <= 0) {
    throw new SudachiError(`Received an invalid ${label} size.`, {
      code: "LAYOUT_MISMATCH",
    });
  }

  if (arrayLayoutKind !== 0 && arrayLayoutKind !== 1) {
    throw new SudachiError(`Unsupported ${label} array layout kind: ${arrayLayoutKind}.`, {
      code: "LAYOUT_MISMATCH",
    });
  }
}

function validateMorphemeResultLayout(layout: MorphemeResultLayout): void {
  validateArrayLayout(
    layout.layoutVersion,
    MORPHEME_RESULT_LAYOUT_VERSION,
    layout.resultSize,
    layout.arrayLayoutKind,
    "morpheme result layout",
  );
}

function validateSentenceSpanResultLayout(layout: SentenceSpanResultLayout): void {
  validateArrayLayout(
    layout.layoutVersion,
    SENTENCE_SPAN_RESULT_LAYOUT_VERSION,
    layout.resultSize,
    layout.arrayLayoutKind,
    "sentence span result layout",
  );
}

function validateLookupResultLayout(layout: LookupResultLayout): void {
  validateArrayLayout(
    layout.layoutVersion,
    LOOKUP_RESULT_LAYOUT_VERSION,
    layout.resultSize,
    layout.arrayLayoutKind,
    "lookup result layout",
  );
}

function validatePosMatcherResultLayout(layout: PosMatcherResultLayout): void {
  validateArrayLayout(
    layout.layoutVersion,
    POS_MATCHER_RESULT_LAYOUT_VERSION,
    layout.resultSize,
    layout.arrayLayoutKind,
    "POS matcher result layout",
  );
}

function readResultLayout<TLayout>(
  library: NativeErrorLibrary,
  fieldCount: number,
  readLayout: (outLayout: BigUint64Array) => number,
  fallbackMessage: string,
  buildLayout: (values: readonly number[]) => TLayout,
  validateLayout: (layout: TLayout) => void,
): TLayout {
  const outLayout = new BigUint64Array(fieldCount);
  const status = readLayout(outLayout);
  if (status !== 0) {
    throw createNativeSudachiError(library, status, fallbackMessage);
  }

  const layout = buildLayout(Array.from(outLayout, (value) => Number(value)));
  validateLayout(layout);
  return layout;
}

const COMMON_NATIVE_SYMBOL_DEFS = {
  sudachi_get_last_error: {
    args: [],
    returns: "cstring",
  },
  sudachi_status_code_name: {
    args: ["i32"],
    returns: "cstring",
  },
} as const;

const TOKENIZER_NATIVE_SYMBOL_DEFS = {
  ...COMMON_NATIVE_SYMBOL_DEFS,
  sudachi_create_tokenizer: {
    args: ["cstring", "cstring", "cstring", "ptr"],
    returns: "i32",
  },
  sudachi_free_tokenizer: {
    args: ["ptr"],
    returns: "void",
  },
  sudachi_tokenize: {
    args: ["ptr", "cstring", "i32", "ptr"],
    returns: "i32",
  },
  sudachi_tokenize_subset: {
    args: ["ptr", "cstring", "i32", "u32", "ptr"],
    returns: "i32",
  },
  sudachi_split_morpheme: {
    args: ["ptr", "cstring", "i32", "usize", "i32", "ptr"],
    returns: "i32",
  },
  sudachi_split_morphemes: {
    args: ["ptr", "cstring", "i32", "i32", "ptr"],
    returns: "i32",
  },
  sudachi_compile_pos_matcher: {
    args: ["ptr", "cstring", "ptr"],
    returns: "i32",
  },
  sudachi_free_result: {
    args: ["ptr"],
    returns: "void",
  },
  sudachi_free_pos_matcher_result: {
    args: ["ptr"],
    returns: "void",
  },
  sudachi_get_morpheme_result_layout: {
    args: ["ptr"],
    returns: "i32",
  },
  sudachi_get_pos_matcher_result_layout: {
    args: ["ptr"],
    returns: "i32",
  },
} as const;

const SENTENCE_SPLITTER_NATIVE_SYMBOL_DEFS = {
  ...COMMON_NATIVE_SYMBOL_DEFS,
  sudachi_create_sentence_splitter: {
    args: ["cstring", "cstring", "cstring", "ptr"],
    returns: "i32",
  },
  sudachi_free_sentence_splitter: {
    args: ["ptr"],
    returns: "void",
  },
  sudachi_split_sentences: {
    args: ["ptr", "cstring", "ptr"],
    returns: "i32",
  },
  sudachi_free_sentence_spans: {
    args: ["ptr"],
    returns: "void",
  },
  sudachi_get_sentence_span_layout: {
    args: ["ptr"],
    returns: "i32",
  },
} as const;

const LOOKUP_NATIVE_SYMBOL_DEFS = {
  ...COMMON_NATIVE_SYMBOL_DEFS,
  sudachi_lookup: {
    args: ["ptr", "cstring", "ptr"],
    returns: "i32",
  },
  sudachi_lookup_subset: {
    args: ["ptr", "cstring", "u32", "ptr"],
    returns: "i32",
  },
  sudachi_free_lookup_result: {
    args: ["ptr"],
    returns: "void",
  },
  sudachi_get_lookup_result_layout: {
    args: ["ptr"],
    returns: "i32",
  },
} as const;

type NativeLibraryLoader = (
  libraryPath: string,
  symbolDefinitions: typeof TOKENIZER_NATIVE_SYMBOL_DEFS,
) => {
  symbols: NativeSymbols;
  close(): void;
};

type NativeSentenceSplitterLibraryLoader = (
  libraryPath: string,
  symbolDefinitions: typeof SENTENCE_SPLITTER_NATIVE_SYMBOL_DEFS,
) => {
  symbols: NativeSentenceSplitterSymbols;
  close(): void;
};

type NativeLookupLibraryLoader = (
  libraryPath: string,
  symbolDefinitions: typeof LOOKUP_NATIVE_SYMBOL_DEFS,
) => {
  symbols: NativeLookupSymbols;
  close(): void;
};

function createNativeSudachiLibrary(symbols: NativeSymbols, close: () => void): NativeSudachiLibrary {
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

function createNativeLookupLibrary(symbols: NativeLookupSymbols, close: () => void): NativeLookupLibrary {
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

function createNativeSentenceSplitterLibrary(
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
  const libraryPath = loadNativeLibraryPath(options.libraryPath);
  const loaded = openLibrary(libraryPath, TOKENIZER_NATIVE_SYMBOL_DEFS) as { symbols: NativeSymbols; close(): void };

  return createNativeSudachiLibrary(loaded.symbols, () => loaded.close());
}

export function loadLookupLibrary(
  options: NativeLibraryLoadOptions = {},
  openLibrary: NativeLookupLibraryLoader = dlopen as unknown as NativeLookupLibraryLoader,
): NativeLookupLibrary {
  const libraryPath = loadNativeLibraryPath(options.libraryPath);
  const loaded = openLibrary(libraryPath, LOOKUP_NATIVE_SYMBOL_DEFS) as {
    symbols: NativeLookupSymbols;
    close(): void;
  };

  return createNativeLookupLibrary(loaded.symbols, () => loaded.close());
}

export function loadSentenceSplitterLibrary(
  options: NativeLibraryLoadOptions = {},
  openLibrary: NativeSentenceSplitterLibraryLoader = dlopen as unknown as NativeSentenceSplitterLibraryLoader,
): NativeSentenceSplitterLibrary {
  const libraryPath = loadNativeLibraryPath(options.libraryPath);
  const loaded = openLibrary(libraryPath, SENTENCE_SPLITTER_NATIVE_SYMBOL_DEFS) as {
    symbols: NativeSentenceSplitterSymbols;
    close(): void;
  };

  return createNativeSentenceSplitterLibrary(loaded.symbols, () => loaded.close());
}

export function readNativeError(library: NativeErrorLibrary): string {
  try {
    return String(library.symbols.sudachi_get_last_error() ?? "");
  } catch {
    return "";
  }
}

export function readNativeStatusCodeName(
  library: NativeErrorLibrary,
  status: number,
): NativeSudachiErrorCode {
  try {
    const code = String(library.symbols.sudachi_status_code_name(status) ?? "UNKNOWN");
    switch (code) {
      case "OK":
      case "NULL_POINTER":
      case "INVALID_UTF8":
      case "INVALID_MODE":
      case "INVALID_INDEX":
      case "CONFIG":
      case "TOKENIZE":
      case "SPLIT":
      case "LOOKUP":
      case "MORPHEME_SPLIT":
      case "SENTENCE_SPLIT":
      case "INTERNAL":
        return code;
      default:
        return "UNKNOWN";
    }
  } catch {
    return "UNKNOWN";
  }
}

export function createNativeSudachiError(
  library: NativeErrorLibrary,
  status: number,
  fallbackMessage: string,
): SudachiError {
  return new SudachiError(readNativeError(library) || fallbackMessage, {
    code: readNativeStatusCodeName(library, status),
    nativeStatus: status,
  });
}

export function readMorphemeResultLayout(library: NativeSudachiLibrary): MorphemeResultLayout {
  return readResultLayout(
    library,
    MORPHEME_RESULT_LAYOUT_FIELD_COUNT,
    library.symbols.sudachi_get_morpheme_result_layout,
    "Failed to read the morpheme result layout.",
    (values) =>
      ({
        layoutVersion: values[0] ?? 0,
        arrayLayoutKind: values[1] ?? 0,
        arrayItemsOffset: values[2] ?? 0,
        arrayLenOffset: values[3] ?? 0,
        resultSize: values[4] ?? 0,
        surfaceOffset: values[5] ?? 0,
        normalizedOffset: values[6] ?? 0,
        dictionaryFormOffset: values[7] ?? 0,
        readingOffset: values[8] ?? 0,
        posOffset: values[9] ?? 0,
        beginOffset: values[10] ?? 0,
        endOffset: values[11] ?? 0,
        wordIdOffset: values[12] ?? 0,
        posIdOffset: values[13] ?? 0,
        dictionaryIdOffset: values[14] ?? 0,
        isOovOffset: values[15] ?? 0,
        synonymGroupIdsOffset: values[16] ?? 0,
        synonymGroupIdsLenOffset: values[17] ?? 0,
      }) satisfies MorphemeResultLayout,
    validateMorphemeResultLayout,
  );
}

export function readLookupResultLayout(library: NativeLookupLibrary): LookupResultLayout {
  return readResultLayout(
    library,
    LOOKUP_RESULT_LAYOUT_FIELD_COUNT,
    library.symbols.sudachi_get_lookup_result_layout,
    "Failed to read the lookup result layout.",
    (values) =>
      ({
        layoutVersion: values[0] ?? 0,
        arrayLayoutKind: values[1] ?? 0,
        arrayItemsOffset: values[2] ?? 0,
        arrayLenOffset: values[3] ?? 0,
        resultSize: values[4] ?? 0,
        surfaceOffset: values[5] ?? 0,
        posOffset: values[6] ?? 0,
        wordIdOffset: values[7] ?? 0,
        posIdOffset: values[8] ?? 0,
        dictionaryIdOffset: values[9] ?? 0,
        isOovOffset: values[10] ?? 0,
      }) satisfies LookupResultLayout,
    validateLookupResultLayout,
  );
}

export function readPosMatcherResultLayout(library: NativeSudachiLibrary): PosMatcherResultLayout {
  return readResultLayout(
    library,
    POS_MATCHER_RESULT_LAYOUT_FIELD_COUNT,
    library.symbols.sudachi_get_pos_matcher_result_layout,
    "Failed to read the POS matcher result layout.",
    (values) =>
      ({
        layoutVersion: values[0] ?? 0,
        arrayLayoutKind: values[1] ?? 0,
        arrayItemsOffset: values[2] ?? 0,
        arrayLenOffset: values[3] ?? 0,
        resultSize: values[4] ?? 0,
      }) satisfies PosMatcherResultLayout,
    validatePosMatcherResultLayout,
  );
}

export function readSentenceSpanResultLayout(library: NativeSentenceSplitterLibrary): SentenceSpanResultLayout {
  return readResultLayout(
    library,
    SENTENCE_SPAN_RESULT_LAYOUT_FIELD_COUNT,
    library.symbols.sudachi_get_sentence_span_layout,
    "Failed to read the sentence span result layout.",
    (values) =>
      ({
        layoutVersion: values[0] ?? 0,
        arrayLayoutKind: values[1] ?? 0,
        arrayItemsOffset: values[2] ?? 0,
        arrayLenOffset: values[3] ?? 0,
        resultSize: values[4] ?? 0,
        startOffset: values[5] ?? 0,
        endOffset: values[6] ?? 0,
      }) satisfies SentenceSpanResultLayout,
    validateSentenceSpanResultLayout,
  );
}
