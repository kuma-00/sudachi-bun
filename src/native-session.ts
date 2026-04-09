import { type Pointer } from "bun:ffi";

import { SudachiError } from "./types.ts";

function toPointer(value: number | bigint): Pointer {
  return Number(value) as Pointer;
}

export interface NativeHandleSession<TLibrary, TLayout> {
  handle: Pointer;
  layout: TLayout;
  library: TLibrary;
}

export function openNativeHandleSession<TLibrary extends { close(): void }, TLayout>(
  library: TLibrary,
  readLayout: (library: TLibrary) => TLayout,
  createHandle: (library: TLibrary, outHandle: BigUint64Array) => number,
  createError: (library: TLibrary, status: number) => Error,
  nullHandleMessage: string,
): NativeHandleSession<TLibrary, TLayout> {
  try {
    const layout = readLayout(library);
    const handleOut = new BigUint64Array(1);
    const status = createHandle(library, handleOut);

    if (status !== 0) {
      throw createError(library, status);
    }

    const handleValue = handleOut[0] ?? 0n;
    if (handleValue === 0n) {
      throw new SudachiError(nullHandleMessage, {
        code: "INTERNAL",
        nativeStatus: 255,
      });
    }

    return {
      handle: toPointer(handleValue),
      layout,
      library,
    };
  } catch (error) {
    library.close();
    throw error;
  }
}

export function readOwnedNativeResult<TResult>(
  resultOut: BigUint64Array,
  nullMessage: string,
  freeResult: (result: Pointer) => void,
  decodeResult: (result: Pointer) => TResult,
): TResult {
  const resultValue = resultOut[0] ?? 0n;
  if (resultValue === 0n) {
    throw new SudachiError(nullMessage, {
      code: "INTERNAL",
      nativeStatus: 255,
    });
  }

  const resultPtr = toPointer(resultValue);
  try {
    return decodeResult(resultPtr);
  } finally {
    freeResult(resultPtr);
  }
}
