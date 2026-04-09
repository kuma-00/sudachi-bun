import { type Pointer } from "bun:ffi";

import { readSentenceSpanArray, type SentenceSpanOffsets } from "./ffi.ts";
import {
  createNativeSudachiError,
  loadSentenceSplitterLibrary,
  readSentenceSpanResultLayout,
  type NativeSentenceSplitterLibrary,
  type SentenceSpanResultLayout,
} from "./native.ts";
import { SudachiError, type SentenceSpan, type SentenceSplitterLoadOptions } from "./types.ts";

function toPointer(value: number | bigint): Pointer {
  return Number(value) as Pointer;
}

function invalidSentenceSpan(message: string): never {
  throw new SudachiError(message, {
    code: "INTERNAL",
    nativeStatus: 255,
  });
}

function createByteOffsetIndexMap(text: string, offsets: number[]): Map<number, number> {
  const uniqueOffsets = [...new Set(offsets)].sort((left, right) => left - right);
  const totalBytes = Buffer.byteLength(text, "utf8");

  for (const offset of uniqueOffsets) {
    if (!Number.isInteger(offset) || offset < 0 || offset > totalBytes) {
      invalidSentenceSpan(`Sentence splitter returned an out-of-range byte offset: ${offset}.`);
    }
  }

  const resolved = new Map<number, number>();
  let targetIndex = 0;

  while (targetIndex < uniqueOffsets.length && uniqueOffsets[targetIndex] === 0) {
    resolved.set(0, 0);
    targetIndex += 1;
  }

  let byteOffset = 0;
  for (let textIndex = 0; textIndex < text.length && targetIndex < uniqueOffsets.length; ) {
    const codePoint = text.codePointAt(textIndex);
    if (codePoint === undefined) {
      break;
    }

    const codePointText = String.fromCodePoint(codePoint);
    byteOffset += Buffer.byteLength(codePointText, "utf8");
    textIndex += codePoint > 0xffff ? 2 : 1;

    while (targetIndex < uniqueOffsets.length && uniqueOffsets[targetIndex] === byteOffset) {
      resolved.set(byteOffset, textIndex);
      targetIndex += 1;
    }
  }

  if (targetIndex !== uniqueOffsets.length) {
    invalidSentenceSpan(
      `Sentence splitter returned a byte offset that does not align to a UTF-8 boundary: ${uniqueOffsets[targetIndex]}.`,
    );
  }

  return resolved;
}

function materializeSentenceSpans(text: string, offsets: SentenceSpanOffsets[]): SentenceSpan[] {
  if (offsets.length === 0) {
    return [];
  }

  const boundaries: number[] = [];
  for (const { start, end } of offsets) {
    if (start > end) {
      invalidSentenceSpan(`Sentence splitter returned an inverted span: ${start}..${end}.`);
    }

    boundaries.push(start, end);
  }

  const indexMap = createByteOffsetIndexMap(text, boundaries);
  return offsets.map(({ start, end }) => {
    const startIndex = indexMap.get(start);
    const endIndex = indexMap.get(end);
    if (startIndex === undefined || endIndex === undefined) {
      invalidSentenceSpan(`Sentence splitter returned an unreadable span: ${start}..${end}.`);
    }

    return {
      text: text.slice(startIndex, endIndex),
      start,
      end,
    };
  });
}

interface NativeSentenceSplitterSession {
  handle: Pointer;
  layout: SentenceSpanResultLayout;
  library: NativeSentenceSplitterLibrary;
}

function openNativeSentenceSplitter(options: SentenceSplitterLoadOptions): NativeSentenceSplitterSession {
  const library = loadSentenceSplitterLibrary(options);

  try {
    const layout = readSentenceSpanResultLayout(library);
    const handleOut = new BigUint64Array(1);
    const status = library.symbols.sudachi_create_sentence_splitter(
      options.configPath ?? null,
      options.resourceDir ?? null,
      options.dictPath,
      handleOut,
    );

    if (status !== 0) {
      throw createNativeSudachiError(library, status, "Failed to create the sentence splitter.");
    }

    const handleValue = handleOut[0] ?? 0n;
    if (handleValue === 0n) {
      throw new SudachiError("Sentence splitter handle was null after initialization.", {
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

export class SentenceSplitter {
  static create(options: SentenceSplitterLoadOptions): SentenceSplitter {
    return new SentenceSplitter(openNativeSentenceSplitter(options));
  }

  #library: NativeSentenceSplitterLibrary | null;
  #layout: SentenceSpanResultLayout | null;
  #handle: Pointer | null;

  private constructor(session: NativeSentenceSplitterSession) {
    this.#library = session.library;
    this.#layout = session.layout;
    this.#handle = session.handle;
  }

  get closed(): boolean {
    return this.#library === null || this.#handle === null || this.#layout === null;
  }

  split(text: string): SentenceSpan[] {
    const library = this.#library;
    const layout = this.#layout;
    const handle = this.#handle;
    if (library === null || layout === null || handle === null) {
      throw new SudachiError("Sentence splitter has been closed.", {
        code: "SENTENCE_SPLITTER_CLOSED",
      });
    }

    if (text.length === 0) {
      return [];
    }

    const resultOut = new BigUint64Array(1);
    const status = library.symbols.sudachi_split_sentences(handle, text, resultOut);
    if (status !== 0) {
      throw createNativeSudachiError(library, status, "Sentence splitting failed.");
    }

    const resultPtr = resultOut[0] ?? 0n;
    if (resultPtr === 0n) {
      throw new SudachiError("Sentence splitter returned a null result pointer.", {
        code: "INTERNAL",
        nativeStatus: 255,
      });
    }

    const nativeResultPtr = toPointer(resultPtr);
    try {
      return materializeSentenceSpans(text, readSentenceSpanArray(nativeResultPtr, layout));
    } finally {
      library.symbols.sudachi_free_sentence_spans(nativeResultPtr);
    }
  }

  close(): void {
    if (this.#library === null) {
      return;
    }

    if (this.#handle !== null) {
      this.#library.symbols.sudachi_free_sentence_splitter(this.#handle);
    }

    this.#handle = null;
    this.#layout = null;
    this.#library.close();
    this.#library = null;
  }

  [Symbol.dispose](): void {
    this.close();
  }
}

export function createSentenceSplitter(options: SentenceSplitterLoadOptions): SentenceSplitter {
  return SentenceSplitter.create(options);
}
