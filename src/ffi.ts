import { CString, type Pointer, read } from "bun:ffi";
import type {
  LookupResultLayout,
  MorphemeResultLayout,
  PosMatcherResultLayout,
  PosTupleResultLayout,
  PretokenizedResultLayout,
  SentenceSpanResultLayout,
} from "./native/types.ts";
import type {
  LookupEntry,
  Morpheme,
  MorphemeList,
  PosTuple,
  PretokenizedToken,
  SudachiErrorCode,
  WordInfo,
} from "./types.ts";
import { SudachiError } from "./types.ts";

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

function fail(
  message: string,
  code: SudachiErrorCode,
  nativeStatus?: number,
): never {
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

function readUsizeField(
  base: Pointer,
  offset: number,
  fieldName: string,
): number {
  const raw = read.u64(base, offset);
  if (raw > BigInt(Number.MAX_SAFE_INTEGER)) {
    fail(
      `${fieldName} exceeded the safe integer range: ${raw.toString()}`,
      "INTERNAL",
      255,
    );
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
    fail(
      `Invalid ${label} pointer layout: pointer size was zero.`,
      "LAYOUT_MISMATCH",
    );
  }

  const entries = new Array<{ entryBase: Pointer; index: number }>(length);
  for (let index = 0; index < length; index += 1) {
    const entryBase =
      arrayLayoutKind === 1
        ? toPointer(read.ptr(itemsPtr, index * pointerSize))
        : addOffset(itemsPtr, index * resultSize);
    entries[index] = { entryBase, index };
  }

  return entries;
}

interface SynonymGroupIdLayout {
  synonymGroupIdsOffset: number;
  synonymGroupIdsLenOffset: number;
}

interface WordIdListLayout {
  splitAOffset: number;
  splitALenOffset: number;
  splitBOffset: number;
  splitBLenOffset: number;
  wordStructureOffset: number;
  wordStructureLenOffset: number;
}

function readU32List(
  base: Pointer,
  offset: number,
  lenOffset: number,
  fieldName: string,
): number[] {
  if (offset <= 0 || lenOffset <= 0) {
    return [];
  }

  const rawPtr = toPointer(read.ptr(base, offset));
  const length = readUsizeField(base, lenOffset, `${fieldName}Len`);
  if ((rawPtr as number) === 0 || length === 0) {
    return [];
  }

  const values = new Array<number>(length);
  for (let index = 0; index < length; index += 1) {
    values[index] = read.u32(rawPtr, index * 4);
  }
  return values;
}

function readCStringList(
  base: Pointer,
  offset: number,
  lenOffset: number,
  fieldName: string,
): string[] {
  if (offset <= 0 || lenOffset <= 0) {
    return [];
  }

  const rawPtr = toPointer(read.ptr(base, offset));
  const length = readUsizeField(base, lenOffset, `${fieldName}Len`);
  if ((rawPtr as number) === 0 || length === 0) {
    return [];
  }
  const pointerSize = lenOffset - offset;
  if (pointerSize <= 0) {
    return [];
  }

  const values = new Array<string>(length);
  for (let index = 0; index < length; index += 1) {
    values[index] = readCString(
      toPointer(read.ptr(rawPtr, index * pointerSize)),
    );
  }
  return values;
}

function readSynonymGroupIds(
  base: Pointer,
  layout: SynonymGroupIdLayout,
): number[] {
  return readU32List(
    base,
    layout.synonymGroupIdsOffset,
    layout.synonymGroupIdsLenOffset,
    "synonymGroupIds",
  );
}

function readWordIdLists(
  base: Pointer,
  layout: WordIdListLayout,
): {
  splitA: string[];
  splitB: string[];
  wordStructure: string[];
} {
  return {
    splitA: readCStringList(
      base,
      layout.splitAOffset,
      layout.splitALenOffset,
      "splitA",
    ),
    splitB: readCStringList(
      base,
      layout.splitBOffset,
      layout.splitBLenOffset,
      "splitB",
    ),
    wordStructure: readCStringList(
      base,
      layout.wordStructureOffset,
      layout.wordStructureLenOffset,
      "wordStructure",
    ),
  };
}

const MUTATING_ARRAY_METHOD_NAMES = new Set([
  "copyWithin",
  "fill",
  "pop",
  "push",
  "reverse",
  "shift",
  "sort",
  "splice",
  "unshift",
]);

function createCopyOnWriteArray(source: string[]): string[] {
  let detached: string[] | undefined;
  const ensureDetached = (): string[] => {
    if (detached === undefined) {
      detached = [...source];
    }
    return detached;
  };

  return new Proxy(source, {
    get(target, property, receiver) {
      const active = detached ?? target;
      const value = Reflect.get(active, property, receiver);
      if (typeof value !== "function") {
        return value;
      }
      return (...args: unknown[]) => {
        if (
          typeof property === "string" &&
          MUTATING_ARRAY_METHOD_NAMES.has(property)
        ) {
          const writable = ensureDetached();
          return Reflect.apply(value, writable, args);
        }
        return Reflect.apply(value, active, args);
      };
    },
    set(_target, property, value, receiver) {
      if (detached !== undefined) {
        return Reflect.set(detached, property, value, receiver);
      }
      const writable = ensureDetached();
      return Reflect.set(writable, property, value, receiver);
    },
    deleteProperty(_target, property) {
      if (detached !== undefined) {
        return Reflect.deleteProperty(detached, property);
      }
      const writable = ensureDetached();
      return Reflect.deleteProperty(writable, property);
    },
    defineProperty(_target, property, descriptor) {
      if (detached !== undefined) {
        return Reflect.defineProperty(detached, property, descriptor);
      }
      const writable = ensureDetached();
      return Reflect.defineProperty(writable, property, descriptor);
    },
  });
}

function readMorpheme(
  itemPtr: Pointer,
  layout: MorphemeResultLayout,
): Morpheme {
  const wordIdLists = readWordIdLists(itemPtr, layout);
  const wordInfoSource = {
    headWordLength:
      layout.headWordLengthOffset > 0
        ? readUsizeField(itemPtr, layout.headWordLengthOffset, "headWordLength")
        : 0,
    splitA: wordIdLists.splitA,
    splitB: wordIdLists.splitB,
    wordStructure: wordIdLists.wordStructure,
  };
  const morpheme = {
    surface: readCStringField(itemPtr, layout.surfaceOffset),
    headWordLength: wordInfoSource.headWordLength,
    normalized: readCStringField(itemPtr, layout.normalizedOffset),
    dictionaryForm: readCStringField(itemPtr, layout.dictionaryFormOffset),
    reading: readCStringField(itemPtr, layout.readingOffset),
    pos: readCStringField(itemPtr, layout.posOffset),
    begin: readUsizeField(itemPtr, layout.beginOffset, "begin"),
    end: readUsizeField(itemPtr, layout.endOffset, "end"),
    beginChar: readUsizeField(itemPtr, layout.beginCharOffset, "beginChar"),
    endChar: readUsizeField(itemPtr, layout.endCharOffset, "endChar"),
    wordId: readCStringField(itemPtr, layout.wordIdOffset),
    posId: readUnsigned16Field(itemPtr, layout.posIdOffset),
    dictionaryId: readNumberField(itemPtr, layout.dictionaryIdOffset),
    isOov: readBoolField(itemPtr, layout.isOovOffset),
    totalCost:
      layout.totalCostOffset > 0
        ? readNumberField(itemPtr, layout.totalCostOffset)
        : 0,
    splitA: createCopyOnWriteArray(wordInfoSource.splitA),
    splitB: createCopyOnWriteArray(wordInfoSource.splitB),
    wordStructure: createCopyOnWriteArray(wordInfoSource.wordStructure),
    synonymGroupIds: readSynonymGroupIds(itemPtr, layout),
  } as Morpheme;
  let wordInfoSnapshot: WordInfo | undefined;
  Object.defineProperty(morpheme, "getWordInfo", {
    value: (): WordInfo => {
      if (wordInfoSnapshot === undefined) {
        wordInfoSnapshot = {
          headWordLength: wordInfoSource.headWordLength,
          splitA: [...wordInfoSource.splitA],
          splitB: [...wordInfoSource.splitB],
          wordStructure: [...wordInfoSource.wordStructure],
        };
      }
      return {
        headWordLength: wordInfoSnapshot.headWordLength,
        splitA: [...wordInfoSnapshot.splitA],
        splitB: [...wordInfoSnapshot.splitB],
        wordStructure: [...wordInfoSnapshot.wordStructure],
      };
    },
    writable: false,
    configurable: false,
    enumerable: false,
  });
  return morpheme;
}

function attachInternalCost(
  morphemes: Morpheme[],
  internalCost: number,
): MorphemeList {
  Object.defineProperty(morphemes, "internalCost", {
    value: internalCost,
    writable: false,
    configurable: false,
    enumerable: false,
  });
  return morphemes as MorphemeList;
}

function readInternalCost(
  arrayPtr: Pointer,
  layout: MorphemeResultLayout,
): number {
  if (layout.arrayInternalCostOffset <= 0) {
    return 0;
  }
  return readNumberField(arrayPtr, layout.arrayInternalCostOffset);
}

export function readMorphemeArray(
  arrayPtr: Pointer,
  layout: MorphemeResultLayout,
): MorphemeList {
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

  return attachInternalCost(results, readInternalCost(arrayPtr, layout));
}

function readLookupEntry(
  itemPtr: Pointer,
  layout: LookupResultLayout,
): LookupEntry {
  const wordIdLists = readWordIdLists(itemPtr, layout);
  return {
    surface: readCStringField(itemPtr, layout.surfaceOffset),
    headWordLength:
      layout.headWordLengthOffset > 0
        ? readUsizeField(itemPtr, layout.headWordLengthOffset, "headWordLength")
        : 0,
    pos: readCStringField(itemPtr, layout.posOffset),
    wordId: readCStringField(itemPtr, layout.wordIdOffset),
    posId: readUnsigned16Field(itemPtr, layout.posIdOffset),
    dictionaryId: readNumberField(itemPtr, layout.dictionaryIdOffset),
    isOov: readBoolField(itemPtr, layout.isOovOffset),
    splitA: wordIdLists.splitA,
    splitB: wordIdLists.splitB,
    wordStructure: wordIdLists.wordStructure,
  };
}

export function readLookupEntryArray(
  arrayPtr: Pointer,
  layout: LookupResultLayout,
): LookupEntry[] {
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

function readPretokenizedToken(
  itemPtr: Pointer,
  layout: PretokenizedResultLayout,
): PretokenizedToken {
  const wordIdLists = readWordIdLists(itemPtr, layout);
  return {
    surface: readCStringField(itemPtr, layout.surfaceOffset),
    headWordLength:
      layout.headWordLengthOffset > 0
        ? readUsizeField(itemPtr, layout.headWordLengthOffset, "headWordLength")
        : 0,
    normalized: readCStringField(itemPtr, layout.normalizedOffset),
    dictionaryForm: readCStringField(itemPtr, layout.dictionaryFormOffset),
    reading: readCStringField(itemPtr, layout.readingOffset),
    pos: readCStringField(itemPtr, layout.posOffset),
    beginByte: readUsizeField(itemPtr, layout.beginByteOffset, "beginByte"),
    endByte: readUsizeField(itemPtr, layout.endByteOffset, "endByte"),
    beginChar: readUsizeField(itemPtr, layout.beginCharOffset, "beginChar"),
    endChar: readUsizeField(itemPtr, layout.endCharOffset, "endChar"),
    wordId: readCStringField(itemPtr, layout.wordIdOffset),
    posId: readUnsigned16Field(itemPtr, layout.posIdOffset),
    dictionaryId: readNumberField(itemPtr, layout.dictionaryIdOffset),
    isOov: readBoolField(itemPtr, layout.isOovOffset),
    splitA: wordIdLists.splitA,
    splitB: wordIdLists.splitB,
    wordStructure: wordIdLists.wordStructure,
    synonymGroupIds: readSynonymGroupIds(itemPtr, layout),
  };
}

export function readPretokenizedArray(
  arrayPtr: Pointer,
  layout: PretokenizedResultLayout,
): PretokenizedToken[] {
  const entries = readArrayEntries(
    arrayPtr,
    layout.arrayItemsOffset,
    layout.arrayLenOffset,
    layout.resultSize,
    layout.arrayLayoutKind,
    "Pretokenized result layout",
  );

  const results = new Array<PretokenizedToken>(entries.length);
  for (const { entryBase, index } of entries) {
    results[index] = readPretokenizedToken(entryBase, layout);
  }

  return results;
}

export function readPosMatcherIdArray(
  arrayPtr: Pointer,
  layout: PosMatcherResultLayout,
): number[] {
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

export function readPosTupleArray(
  arrayPtr: Pointer,
  layout: PosTupleResultLayout,
): PosTuple | null {
  const entries = readArrayEntries(
    arrayPtr,
    layout.arrayItemsOffset,
    layout.arrayLenOffset,
    layout.resultSize,
    layout.arrayLayoutKind,
    "POS tuple result layout",
  );

  if (entries.length !== 6) {
    return null;
  }

  const values = new Array<string>(entries.length);
  for (const { entryBase, index } of entries) {
    values[index] =
      layout.arrayLayoutKind === 1
        ? readCString(entryBase)
        : readCString(toPointer(read.ptr(entryBase, 0)));
  }

  const [a, b, c, d, e, f] = values;
  if (
    a === undefined ||
    b === undefined ||
    c === undefined ||
    d === undefined ||
    e === undefined ||
    f === undefined
  ) {
    return null;
  }

  return [a, b, c, d, e, f];
}

export function readSentenceSpanArray(
  arrayPtr: Pointer,
  layout: SentenceSpanResultLayout,
): SentenceSpanOffsets[] {
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
