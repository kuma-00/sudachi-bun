import { CString, read, type Pointer } from "bun:ffi";

import type { Morpheme, SudachiErrorCode } from "./types.ts";
import { SudachiError } from "./types.ts";
import type { MorphemeResultLayout } from "./native.ts";

function toPointer(value: number | bigint): Pointer {
  return Number(value) as Pointer;
}

function addOffset(ptrValue: Pointer, offset: number): Pointer {
  return ((ptrValue as number) + offset) as Pointer;
}

function fail(message: string, code: SudachiErrorCode, nativeStatus?: number): never {
  throw new SudachiError(message, {
    code,
    nativeStatus,
  });
}

function readCString(ptrValue: Pointer | null): string {
  if (ptrValue === null || (ptrValue as number) === 0) {
    return "";
  }

  return String(new CString(ptrValue));
}

function readCStringField(base: Pointer, offset: number): string {
  const fieldPtr = toPointer(read.ptr(base, offset));
  return readCString(fieldPtr);
}

function readNumberField(base: Pointer, offset: number): number {
  return read.i32(base, offset);
}

function readUnsigned16Field(base: Pointer, offset: number): number {
  return read.u16(base, offset);
}

function readUsizeField(base: Pointer, offset: number, fieldName: string): number {
  const raw = read.u64(base, offset);
  if (raw > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail(`${fieldName} exceeded the safe integer range: ${raw.toString()}`, "INTERNAL", 255);
  }

  return Number(raw);
}

function readBoolField(base: Pointer, offset: number): boolean {
  return read.u8(base, offset) !== 0;
}

function ensureLayoutInitialized(layout: MorphemeResultLayout): void {
  if (layout.resultSize <= 0) {
    fail("Morpheme result layout was not initialized.", "LAYOUT_MISMATCH");
  }
}

function readSynonymGroupIds(base: Pointer, layout: MorphemeResultLayout): number[] {
  const rawPtr = toPointer(read.ptr(base, layout.synonymGroupIdsOffset));
  const length = readUsizeField(base, layout.synonymGroupIdsLenOffset, "synonymGroupIdsLen");
  if ((rawPtr as number) === 0 || length === 0) {
    return [];
  }

  const ids = new Array<number>(length);
  for (let index = 0; index < length; index += 1) {
    ids[index] = read.u32(rawPtr, index * 4);
  }
  return ids;
}

function readMorpheme(itemPtr: Pointer, layout: MorphemeResultLayout): Morpheme {
  return {
    surface: readCStringField(itemPtr, layout.surfaceOffset),
    normalized: readCStringField(itemPtr, layout.normalizedOffset),
    dictionaryForm: readCStringField(itemPtr, layout.dictionaryFormOffset),
    reading: readCStringField(itemPtr, layout.readingOffset),
    pos: readCStringField(itemPtr, layout.posOffset),
    begin: readUsizeField(itemPtr, layout.beginOffset, "begin"),
    end: readUsizeField(itemPtr, layout.endOffset, "end"),
    wordId: readCStringField(itemPtr, layout.wordIdOffset),
    posId: readUnsigned16Field(itemPtr, layout.posIdOffset),
    dictionaryId: readNumberField(itemPtr, layout.dictionaryIdOffset),
    isOov: readBoolField(itemPtr, layout.isOovOffset),
    synonymGroupIds: readSynonymGroupIds(itemPtr, layout),
  };
}

export function readMorphemeArray(arrayPtr: Pointer, layout: MorphemeResultLayout): Morpheme[] {
  ensureLayoutInitialized(layout);

  const itemsPtr = toPointer(read.ptr(arrayPtr, layout.arrayItemsOffset));
  const length = readUsizeField(arrayPtr, layout.arrayLenOffset, "result length");
  const pointerSize = layout.arrayLenOffset - layout.arrayItemsOffset;
  if (layout.arrayLayoutKind === 1 && pointerSize === 0) {
    fail("Invalid morpheme result array layout: pointer size was zero.", "LAYOUT_MISMATCH");
  }

  const results = new Array<Morpheme>(length);
  for (let index = 0; index < length; index += 1) {
    const entryBase =
      layout.arrayLayoutKind === 1
        ? toPointer(read.ptr(itemsPtr, index * pointerSize))
        : addOffset(itemsPtr, index * layout.resultSize);
    results[index] = readMorpheme(entryBase, layout);
  }

  return results;
}
