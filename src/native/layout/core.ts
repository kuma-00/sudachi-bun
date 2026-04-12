import { SudachiError } from "../../types.ts";

import { createNativeSudachiError } from "../error/mapper.ts";
import type { NativeErrorLibrary } from "../types.ts";

export function validateArrayLayout(
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
    throw new SudachiError(
      `Unsupported ${label} array layout kind: ${arrayLayoutKind}.`,
      {
        code: "LAYOUT_MISMATCH",
      },
    );
  }
}

export function readResultLayout<TLayout>(
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
