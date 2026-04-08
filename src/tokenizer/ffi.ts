import { CString, read, type Pointer } from "bun:ffi";

import type { Morpheme } from "./types.ts";
import type { MorphemeResultLayout } from "./native.ts";

function toPointer(value: number | bigint): Pointer {
  return Number(value) as Pointer;
}

function addOffset(ptrValue: Pointer, offset: number): Pointer {
  return ((ptrValue as number) + offset) as Pointer;
}

function readCString(ptrValue: Pointer | null): string {
  if (!ptrValue || (ptrValue as number) === 0) {
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

function readUsizeField(base: Pointer, offset: number): number {
  const raw = read.u64(base, offset);
  if (raw > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`usize value exceeds safe integer range: ${raw.toString()}`);
  }

  return Number(raw);
}

function readBoolField(base: Pointer, offset: number): boolean {
  return read.u8(base, offset) !== 0;
}

function readLen(base: Pointer): number {
  const raw = read.u64(base, readLayout.arrayLenOffset);
  if (raw > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Result length exceeds safe integer range: ${raw.toString()}`);
  }

  return Number(raw);
}

let readLayout: MorphemeResultLayout = {
  arrayLayoutKind: 0,
  arrayItemsOffset: 0,
  arrayLenOffset: 0,
  resultSize: 0,
  surfaceOffset: 0,
  normalizedOffset: 0,
  dictionaryFormOffset: 0,
  readingOffset: 0,
  posOffset: 0,
  beginOffset: 0,
  endOffset: 0,
  wordIdOffset: 0,
  posIdOffset: 0,
  dictionaryIdOffset: 0,
  isOovOffset: 0,
  synonymGroupIdsOffset: 0,
  synonymGroupIdsLenOffset: 0,
  detailJsonOffset: 0,
};

function ensureLayoutInitialized(): void {
  if (readLayout.resultSize === 0 || readLayout.arrayLenOffset === 0 || readLayout.detailJsonOffset === 0) {
    throw new Error("Morpheme result layout has not been initialized.");
  }
}

function readSynonymGroupIds(base: Pointer): number[] {
  const rawPtr = toPointer(read.ptr(base, readLayout.synonymGroupIdsOffset));
  const length = readUsizeField(base, readLayout.synonymGroupIdsLenOffset);
  if (!rawPtr || (rawPtr as number) === 0 || length === 0) {
    return [];
  }

  const ids = new Array<number>(length);
  for (let index = 0; index < length; index += 1) {
    ids[index] = read.u32(rawPtr, index * 4);
  }
  return ids;
}

function parseDetails(detailJson: string): { details: Record<string, unknown> | null; detailParseError?: string } {
  if (detailJson.trim().length === 0) {
    return { details: null };
  }

  try {
    const parsed = JSON.parse(detailJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { details: parsed as Record<string, unknown> };
    }

    return { details: { value: parsed } };
  } catch (error) {
    return {
      details: null,
      detailParseError: error instanceof Error ? error.message : String(error),
    };
  }
}

function readMorpheme(itemPtr: Pointer): Morpheme {
  const detailJson = readCStringField(itemPtr, readLayout.detailJsonOffset);
  const parsedDetails = parseDetails(detailJson);

  return {
    surface: readCStringField(itemPtr, readLayout.surfaceOffset),
    normalized: readCStringField(itemPtr, readLayout.normalizedOffset),
    dictionaryForm: readCStringField(itemPtr, readLayout.dictionaryFormOffset),
    reading: readCStringField(itemPtr, readLayout.readingOffset),
    pos: readCStringField(itemPtr, readLayout.posOffset),
    begin: readUsizeField(itemPtr, readLayout.beginOffset),
    end: readUsizeField(itemPtr, readLayout.endOffset),
    wordId: readCStringField(itemPtr, readLayout.wordIdOffset),
    posId: readUnsigned16Field(itemPtr, readLayout.posIdOffset),
    dictionaryId: readNumberField(itemPtr, readLayout.dictionaryIdOffset),
    isOov: readBoolField(itemPtr, readLayout.isOovOffset),
    synonymGroupIds: readSynonymGroupIds(itemPtr),
    detailJson,
    details: parsedDetails.details,
    detailParseError: parsedDetails.detailParseError,
  };
}

export function readMorphemeArray(arrayPtr: Pointer): Morpheme[] {
  ensureLayoutInitialized();

  const itemsPtr = toPointer(read.ptr(arrayPtr, readLayout.arrayItemsOffset));
  const length = readLen(arrayPtr);
  const pointerSize = readLayout.arrayLenOffset - readLayout.arrayItemsOffset;
  if (readLayout.arrayLayoutKind === 1 && pointerSize === 0) {
    throw new Error("Invalid morpheme result array layout: pointer size was zero.");
  }

  const results = new Array<Morpheme>(length);
  for (let index = 0; index < length; index += 1) {
    const entryBase =
      readLayout.arrayLayoutKind === 1
        ? toPointer(read.ptr(itemsPtr, index * pointerSize))
        : addOffset(itemsPtr, index * readLayout.resultSize);
    results[index] = readMorpheme(entryBase);
  }

  return results;
}

export function setMorphemeResultLayout(layout: MorphemeResultLayout): void {
  readLayout = layout;
}
