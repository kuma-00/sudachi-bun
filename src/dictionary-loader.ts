import { createNativeSudachiError } from "./native/error/mapper.ts";
import { readDictionaryInspectionResultLayout } from "./native/layout/index.ts";
import { loadNativeLibrary } from "./native/loader.ts";
import {
  type DictionaryBytesInspection,
  type DictionaryKind,
  type NativeLibraryLoadOptions,
  SudachiError,
} from "./types.ts";

function normalizeDictionaryKind(
  value: number,
  layout: {
    kindUnknownValue: number;
    kindSystemValue: number;
    kindUserValue: number;
  },
): DictionaryKind {
  if (value === layout.kindSystemValue) {
    return "system";
  }

  if (value === layout.kindUserValue) {
    return "user";
  }

  if (value === layout.kindUnknownValue) {
    return "unknown";
  }

  return "unknown";
}

function decodeDictionaryInspection(
  resultBytes: Uint8Array,
  layout: {
    kindOffset: number;
    headerVersionOffset: number;
    isLoadableOffset: number;
    kindUnknownValue: number;
    kindSystemValue: number;
    kindUserValue: number;
  },
): DictionaryBytesInspection {
  try {
    const view = new DataView(
      resultBytes.buffer,
      resultBytes.byteOffset,
      resultBytes.byteLength,
    );
    const kind = view.getInt32(layout.kindOffset, true);
    const rawHeaderVersion = view.getInt32(layout.headerVersionOffset, true);
    const loadable = view.getInt32(layout.isLoadableOffset, true) !== 0;

    return {
      dictionaryKind: normalizeDictionaryKind(kind, layout),
      headerVersion: rawHeaderVersion < 0 ? null : rawHeaderVersion,
      loadable,
    };
  } catch {
    throw new SudachiError(
      "Native dictionary inspection result layout was invalid.",
      {
        code: "LAYOUT_MISMATCH",
      },
    );
  }
}

export function inspectDictionaryBytes(
  bytes: Uint8Array,
  options: NativeLibraryLoadOptions = {},
): DictionaryBytesInspection {
  if (!(bytes instanceof Uint8Array)) {
    throw new SudachiError("bytes must be a Uint8Array.", {
      code: "INVALID_ARGUMENT",
    });
  }

  const library = loadNativeLibrary(options);
  try {
    const layout = readDictionaryInspectionResultLayout(library);
    const resultOut = new Uint8Array(layout.resultSize);
    const status = library.symbols.sudachi_inspect_dictionary_bytes(
      bytes,
      bytes.byteLength,
      resultOut,
    );
    const inspection = decodeDictionaryInspection(resultOut, layout);

    if (status === 0) {
      return inspection;
    }

    const error = createNativeSudachiError(
      library,
      status,
      "Failed to inspect dictionary bytes.",
    );
    if (error.code === "CONFIG") {
      return inspection;
    }

    throw error;
  } finally {
    library.close();
  }
}
