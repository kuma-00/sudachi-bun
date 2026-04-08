import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dlopen, suffix, type Pointer } from "bun:ffi";

import type { NativeSudachiErrorCode, TokenizerLoadOptions } from "./types.ts";
import { SudachiError } from "./types.ts";

const MORPHEME_RESULT_LAYOUT_FIELD_COUNT = 18;
export const MORPHEME_RESULT_LAYOUT_VERSION = 1;

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

export interface NativeSudachiLibrary {
  symbols: {
    sudachi_create_tokenizer: (dictPath: string, configPath: string | null, outHandle: NodeJS.TypedArray | Pointer | null) => number;
    sudachi_free_tokenizer: (handle: Pointer | NodeJS.TypedArray | null) => void;
    sudachi_tokenize: (handle: Pointer | NodeJS.TypedArray | null, inputUtf8: string, mode: number, outResult: NodeJS.TypedArray | Pointer | null) => number;
    sudachi_free_result: (result: Pointer | NodeJS.TypedArray | null) => void;
    sudachi_get_morpheme_result_layout: (outLayout: NodeJS.TypedArray | Pointer | null) => number;
    sudachi_get_last_error: () => import("bun:ffi").CString;
    sudachi_status_code_name: (status: number) => import("bun:ffi").CString;
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

function validateMorphemeResultLayout(layout: MorphemeResultLayout): void {
  if (layout.layoutVersion !== MORPHEME_RESULT_LAYOUT_VERSION) {
    throw new SudachiError(
      `Unsupported morpheme result layout version: expected ${MORPHEME_RESULT_LAYOUT_VERSION}, received ${layout.layoutVersion}.`,
      { code: "LAYOUT_MISMATCH" },
    );
  }

  if (layout.resultSize <= 0) {
    throw new SudachiError("Received an invalid morpheme result layout size.", {
      code: "LAYOUT_MISMATCH",
    });
  }

  if (layout.arrayLayoutKind !== 0 && layout.arrayLayoutKind !== 1) {
    throw new SudachiError(
      `Unsupported morpheme result array layout kind: ${layout.arrayLayoutKind}.`,
      { code: "LAYOUT_MISMATCH" },
    );
  }
}

export function loadNativeLibrary(options: TokenizerLoadOptions): NativeSudachiLibrary {
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
    sudachi_status_code_name: {
      args: ["i32"],
      returns: "cstring",
    },
  }) as unknown as NativeSudachiLibrary;
}

export function readNativeError(library: NativeSudachiLibrary): string {
  try {
    return String(library.symbols.sudachi_get_last_error() ?? "");
  } catch {
    return "";
  }
}

export function readNativeStatusCodeName(
  library: NativeSudachiLibrary,
  status: number,
): NativeSudachiErrorCode {
  try {
    const code = String(library.symbols.sudachi_status_code_name(status) ?? "UNKNOWN");
    switch (code) {
      case "OK":
      case "NULL_POINTER":
      case "INVALID_UTF8":
      case "INVALID_MODE":
      case "CONFIG":
      case "TOKENIZE":
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
  library: NativeSudachiLibrary,
  status: number,
  fallbackMessage: string,
): SudachiError {
  return new SudachiError(readNativeError(library) || fallbackMessage, {
    code: readNativeStatusCodeName(library, status),
    nativeStatus: status,
  });
}

export function readMorphemeResultLayout(library: NativeSudachiLibrary): MorphemeResultLayout {
  const outLayout = new BigUint64Array(MORPHEME_RESULT_LAYOUT_FIELD_COUNT);
  const status = library.symbols.sudachi_get_morpheme_result_layout(outLayout);
  if (status !== 0) {
    throw createNativeSudachiError(library, status, "Failed to read the morpheme result layout.");
  }

  const values = Array.from(outLayout, (value) => Number(value));
  const layout = {
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
  } satisfies MorphemeResultLayout;

  validateMorphemeResultLayout(layout);
  return layout;
}
