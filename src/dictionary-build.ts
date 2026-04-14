import { CString, type Pointer, ptr, read } from "bun:ffi";

import { createNativeSudachiError } from "./native/error/mapper.ts";
import { readDictionaryBuildReportLayout } from "./native/layout/dictionary-build-report.ts";
import { loadNativeLibrary } from "./native/loader.ts";
import { readOwnedNativeResult } from "./native-session.ts";
import {
  type BuildSystemDictionaryOptions,
  type BuildUserDictionaryOptions,
  type DictionaryBuildPartReport,
  type DictionaryBuildResult,
  SudachiError,
} from "./types.ts";

const CSTRING_ENCODER = new TextEncoder();

function toPointer(value: number | bigint): Pointer {
  return Number(value) as Pointer;
}

function encodeCString(value: string): Uint8Array {
  return CSTRING_ENCODER.encode(`${value}\0`);
}

function encodeCStringPointerArray(values: readonly string[]): {
  pointers: BigUint64Array;
  keepAlive: Uint8Array[];
} {
  const keepAlive = new Array<Uint8Array>(values.length);
  const pointers = new BigUint64Array(values.length);
  for (const [index, value] of values.entries()) {
    const encoded = encodeCString(value);
    keepAlive[index] = encoded;
    pointers[index] = BigInt(ptr(encoded));
  }
  return { pointers, keepAlive };
}

function readUsizeField(
  base: Pointer,
  offset: number,
  fieldName: string,
): number {
  const raw = read.u64(base, offset);
  if (raw > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new SudachiError(
      `${fieldName} exceeded the safe integer range: ${raw.toString()}`,
      {
        code: "INTERNAL",
        nativeStatus: 255,
      },
    );
  }
  return Number(raw);
}

function decodeDictionaryBuildReport(
  resultPtr: Pointer,
  layout: ReturnType<typeof readDictionaryBuildReportLayout>,
): DictionaryBuildPartReport[] {
  const entriesPtr = toPointer(read.ptr(resultPtr, layout.arrayItemsOffset));
  const length = readUsizeField(
    resultPtr,
    layout.arrayLenOffset,
    "dictionary build report length",
  );

  const report = new Array<DictionaryBuildPartReport>(length);
  for (let index = 0; index < length; index += 1) {
    const entryBase = toPointer(
      (entriesPtr as number) + index * layout.resultSize,
    );
    const partPtr = toPointer(read.ptr(entryBase, layout.partOffset));
    if (partPtr === 0) {
      throw new SudachiError("dictionary build part name pointer was null.", {
        code: "INTERNAL",
        nativeStatus: 255,
      });
    }

    const elapsedMs = readUsizeField(
      entryBase,
      layout.elapsedMillisOffset,
      "dictionary build part elapsed milliseconds",
    );

    report[index] = {
      part: String(new CString(partPtr)),
      size: readUsizeField(
        entryBase,
        layout.sizeOffset,
        "dictionary build part size",
      ),
      timeSeconds: elapsedMs / 1000,
      isWrite: read.u8(entryBase, layout.isWriteOffset) !== 0,
    };
  }
  return report;
}

function validateRequiredString(name: string, value: unknown): string {
  if (typeof value !== "string") {
    throw new SudachiError(`${name} must be a string.`, {
      code: "INVALID_ARGUMENT",
    });
  }
  if (value.trim().length === 0) {
    throw new SudachiError(`${name} must not be empty.`, {
      code: "INVALID_ARGUMENT",
    });
  }
  return value;
}

function validateOptionalString(
  name: string,
  value: unknown,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return validateRequiredString(name, value);
}

function validateLexiconPaths(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    throw new SudachiError("lexiconPaths must be a readonly string array.", {
      code: "INVALID_ARGUMENT",
    });
  }
  if (value.length === 0) {
    throw new SudachiError("lexiconPaths must not be empty.", {
      code: "INVALID_ARGUMENT",
    });
  }

  return value.map((item, index) =>
    validateRequiredString(`lexiconPaths[${index}]`, item),
  );
}

function validateBuildSystemOptions(
  options: BuildSystemDictionaryOptions,
): BuildSystemDictionaryOptions {
  return {
    matrixPath: validateRequiredString("matrixPath", options.matrixPath),
    lexiconPaths: validateLexiconPaths(options.lexiconPaths),
    outputPath: validateRequiredString("outputPath", options.outputPath),
    description: validateOptionalString("description", options.description),
    libraryPath: validateOptionalString("libraryPath", options.libraryPath),
  };
}

function validateBuildUserOptions(
  options: BuildUserDictionaryOptions,
): BuildUserDictionaryOptions {
  return {
    systemDictPath: validateRequiredString(
      "systemDictPath",
      options.systemDictPath,
    ),
    lexiconPaths: validateLexiconPaths(options.lexiconPaths),
    outputPath: validateRequiredString("outputPath", options.outputPath),
    description: validateOptionalString("description", options.description),
    libraryPath: validateOptionalString("libraryPath", options.libraryPath),
  };
}

function toBuildResult(
  outputPath: string,
  report: DictionaryBuildPartReport[],
): DictionaryBuildResult {
  return { outputPath, report };
}

export function buildSystemDictionary(
  options: BuildSystemDictionaryOptions,
): DictionaryBuildResult {
  const resolved = validateBuildSystemOptions(options);
  const library = loadNativeLibrary({ libraryPath: resolved.libraryPath });

  try {
    const build = library.symbols.sudachi_build_system_dictionary;
    const free = library.symbols.sudachi_free_dictionary_build_report;
    if (!build || !free) {
      throw new SudachiError("Native dictionary build APIs are unavailable.", {
        code: "LAYOUT_MISMATCH",
      });
    }

    const layout = readDictionaryBuildReportLayout(library);
    const reportOut = new BigUint64Array(1);
    const { pointers, keepAlive } = encodeCStringPointerArray(
      resolved.lexiconPaths,
    );
    void keepAlive;

    const status = build(
      resolved.matrixPath,
      ptr(pointers),
      pointers.length,
      resolved.outputPath,
      resolved.description ?? null,
      reportOut,
    );
    if (status !== 0) {
      throw createNativeSudachiError(
        library,
        status,
        "Failed to build the system dictionary.",
      );
    }

    const report = readOwnedNativeResult(
      reportOut,
      "Dictionary build report pointer was null.",
      (resultPtr) => free(resultPtr),
      (resultPtr) => decodeDictionaryBuildReport(resultPtr, layout),
    );
    return toBuildResult(resolved.outputPath, report);
  } finally {
    library.close();
  }
}

export function buildUserDictionary(
  options: BuildUserDictionaryOptions,
): DictionaryBuildResult {
  const resolved = validateBuildUserOptions(options);
  const library = loadNativeLibrary({ libraryPath: resolved.libraryPath });

  try {
    const build = library.symbols.sudachi_build_user_dictionary;
    const free = library.symbols.sudachi_free_dictionary_build_report;
    if (!build || !free) {
      throw new SudachiError("Native dictionary build APIs are unavailable.", {
        code: "LAYOUT_MISMATCH",
      });
    }

    const layout = readDictionaryBuildReportLayout(library);
    const reportOut = new BigUint64Array(1);
    const { pointers, keepAlive } = encodeCStringPointerArray(
      resolved.lexiconPaths,
    );
    void keepAlive;

    const status = build(
      resolved.systemDictPath,
      ptr(pointers),
      pointers.length,
      resolved.outputPath,
      resolved.description ?? null,
      reportOut,
    );
    if (status !== 0) {
      throw createNativeSudachiError(
        library,
        status,
        "Failed to build the user dictionary.",
      );
    }

    const report = readOwnedNativeResult(
      reportOut,
      "Dictionary build report pointer was null.",
      (resultPtr) => free(resultPtr),
      (resultPtr) => decodeDictionaryBuildReport(resultPtr, layout),
    );
    return toBuildResult(resolved.outputPath, report);
  } finally {
    library.close();
  }
}
