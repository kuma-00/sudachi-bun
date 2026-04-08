import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dlopen, suffix, type Pointer } from "bun:ffi";

import type { TokenizerOptions } from "./types.ts";

const MORPHEME_RESULT_LAYOUT_FIELD_COUNT = 18;

export interface MorphemeResultLayout {
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
  detailJsonOffset: number;
}

export interface NativeSudachiLibrary {
  symbols: {
    sudachi_create_tokenizer: (dictPath: string, configPath: string | null, outHandle: NodeJS.TypedArray | Pointer | null) => number;
    sudachi_free_tokenizer: (handle: Pointer | NodeJS.TypedArray | null) => void;
    sudachi_tokenize: (handle: Pointer | NodeJS.TypedArray | null, inputUtf8: string, mode: number, outResult: NodeJS.TypedArray | Pointer | null) => number;
    sudachi_free_result: (result: Pointer | NodeJS.TypedArray | null) => void;
    sudachi_get_morpheme_result_layout: (outLayout: NodeJS.TypedArray | Pointer | null) => number;
    sudachi_get_last_error: () => import("bun:ffi").CString;
  };
  close(): void;
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

export function loadNativeLibrary(options: TokenizerOptions): NativeSudachiLibrary {
  const libraryPath = loadNativeLibraryPath(options.libraryPath);

  return dlopen(libraryPath, {
    sudachi_create_tokenizer: {
      args: ["cstring", "cstring", "ptr"],
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
    sudachi_free_result: {
      args: ["ptr"],
      returns: "void",
    },
    sudachi_get_morpheme_result_layout: {
      args: ["ptr"],
      returns: "i32",
    },
    sudachi_get_last_error: {
      args: [],
      returns: "cstring",
    },
  }) as unknown as NativeSudachiLibrary;
}

export function readMorphemeResultLayout(library: NativeSudachiLibrary): MorphemeResultLayout {
  const outLayout = new BigUint64Array(MORPHEME_RESULT_LAYOUT_FIELD_COUNT);
  const status = library.symbols.sudachi_get_morpheme_result_layout(outLayout);
  if (status !== 0) {
    const message = readNativeError(library);
    throw new Error(message || `Failed to read morpheme result layout (status ${status})`);
  }

  const values = Array.from(outLayout, (value) => Number(value));
  return {
    arrayLayoutKind: values[0] ?? 0,
    arrayItemsOffset: values[1] ?? 0,
    arrayLenOffset: values[2] ?? 0,
    resultSize: values[3] ?? 0,
    surfaceOffset: values[4] ?? 0,
    normalizedOffset: values[5] ?? 0,
    dictionaryFormOffset: values[6] ?? 0,
    readingOffset: values[7] ?? 0,
    posOffset: values[8] ?? 0,
    beginOffset: values[9] ?? 0,
    endOffset: values[10] ?? 0,
    wordIdOffset: values[11] ?? 0,
    posIdOffset: values[12] ?? 0,
    dictionaryIdOffset: values[13] ?? 0,
    isOovOffset: values[14] ?? 0,
    synonymGroupIdsOffset: values[15] ?? 0,
    synonymGroupIdsLenOffset: values[16] ?? 0,
    detailJsonOffset: values[17] ?? 0,
  };
}

export function readNativeError(library: NativeSudachiLibrary): string {
  try {
    return String(library.symbols.sudachi_get_last_error() ?? "");
  } catch {
    return "";
  }
}
