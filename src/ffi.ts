import { CString, read, type Pointer } from "bun:ffi";

import type { LookupEntry, Morpheme, SudachiErrorCode } from "./types.ts";
import { SudachiError } from "./types.ts";
import type {
  LookupResultLayout,
  MorphemeResultLayout,
  PosMatcherResultLayout,
  SentenceSpanResultLayout,
} from "./native.ts";

export interface SentenceSpanOffsets {
  start: number;
  end: number;
}

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

function ensureLayoutInitialized(resultSize: number, label: string): void {
  if (resultSize <= 0) {
    fail(`${label} was not initialized.`, "LAYOUT_MISMATCH");
  }
}

function readArrayEntries(
  arrayPtr: Pointer,
  arrayItemsOffset: number,
  arrayLenOffset: number,
  resultSize: number,
  arrayLayoutKind: number,
  label: string,
): Array<{ entryBase: Pointer; index: number }> {
  ensureLayoutInitialized(resultSize, label);

  const itemsPtr = toPointer(read.ptr(arrayPtr, arrayItemsOffset));
  const length = readUsizeField(arrayPtr, arrayLenOffset, `${label} length`);
  const pointerSize = arrayLenOffset - arrayItemsOffset;
  if (arrayLayoutKind === 1 && pointerSize === 0) {
    fail(`Invalid ${label} pointer layout: pointer size was zero.`, "LAYOUT_MISMATCH");
  }

  const entries = new Array<{ entryBase: Pointer; index: number }>(length);
  for (let index = 0; index < length; index += 1) {
    const entryBase =
      arrayLayoutKind === 1 ? toPointer(read.ptr(itemsPtr, index * pointerSize)) : addOffset(itemsPtr, index * resultSize);
    entries[index] = { entryBase, index };
  }

  return entries;
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
  const entries = readArrayEntries(
    arrayPtr,
    layout.arrayItemsOffset,
    layout.arrayLenOffset,
    layout.resultSize,
    layout.arrayLayoutKind,
    "Morpheme result layout",
  );

  const results = new Array<Morpheme>(entries.length);
  for (const { entryBase, index } of entries) {
    results[index] = readMorpheme(entryBase, layout);
  }

  return results;
}

function readLookupEntry(itemPtr: Pointer, layout: LookupResultLayout): LookupEntry {
  return {
    surface: readCStringField(itemPtr, layout.surfaceOffset),
    pos: readCStringField(itemPtr, layout.posOffset),
    wordId: readCStringField(itemPtr, layout.wordIdOffset),
    posId: readUnsigned16Field(itemPtr, layout.posIdOffset),
    dictionaryId: readNumberField(itemPtr, layout.dictionaryIdOffset),
    isOov: readBoolField(itemPtr, layout.isOovOffset),
  };
}

export function readLookupEntryArray(arrayPtr: Pointer, layout: LookupResultLayout): LookupEntry[] {
  const entries = readArrayEntries(
    arrayPtr,
    layout.arrayItemsOffset,
    layout.arrayLenOffset,
    layout.resultSize,
    layout.arrayLayoutKind,
    "Lookup result layout",
  );

  const results = new Array<LookupEntry>(entries.length);
  for (const { entryBase, index } of entries) {
    results[index] = readLookupEntry(entryBase, layout);
  }

  return results;
}

export function readPosMatcherIdArray(arrayPtr: Pointer, layout: PosMatcherResultLayout): number[] {
  const entries = readArrayEntries(
    arrayPtr,
    layout.arrayItemsOffset,
    layout.arrayLenOffset,
    layout.resultSize,
    layout.arrayLayoutKind,
    "POS matcher result layout",
  );

  const results = new Array<number>(entries.length);
  for (const { entryBase, index } of entries) {
    results[index] = readUnsigned16Field(entryBase, 0);
  }

  return results;
}

export function readSentenceSpanArray(arrayPtr: Pointer, layout: SentenceSpanResultLayout): SentenceSpanOffsets[] {
  const entries = readArrayEntries(
    arrayPtr,
    layout.arrayItemsOffset,
    layout.arrayLenOffset,
    layout.resultSize,
    layout.arrayLayoutKind,
    "Sentence span result layout",
  );

  const results = new Array<SentenceSpanOffsets>(entries.length);
  for (const { entryBase, index } of entries) {
    results[index] = {
      start: readUsizeField(entryBase, layout.startOffset, "start"),
      end: readUsizeField(entryBase, layout.endOffset, "end"),
    };
  }

  return results;
}
