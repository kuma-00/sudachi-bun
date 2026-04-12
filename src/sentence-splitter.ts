import { type Pointer } from "bun:ffi";

import { readSentenceSpanArray, type SentenceSpanOffsets } from "./ffi.ts";
import { openNativeHandleSession, readOwnedNativeResult } from "./native-session.ts";
import { createNativeSudachiError } from "./native/error/mapper.ts";
import {
  loadSentenceSplitterLibrary,
  readSentenceSpanResultLayout,
} from "./native.ts";
import type { NativeSentenceSplitterLibrary, SentenceSpanResultLayout } from "./native/types.ts";
import { createUtf8ByteOffsetIndexMap } from "./shared/utf8-offset.ts";
import { SudachiError, type SentenceSpan, type SentenceSplitterOptions } from "./types.ts";

function invalidSentenceSpan(message: string): never {
  throw new SudachiError(message, {
    code: "INTERNAL",
    nativeStatus: 255,
  });
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

  const indexMap = createUtf8ByteOffsetIndexMap(text, boundaries, {
    throwInvalid: invalidSentenceSpan,
    messages: {
      outOfRange: (offset) =>
        `Sentence splitter returned an out-of-range byte offset: ${offset}.`,
      notBoundary: (offset) =>
        `Sentence splitter returned a byte offset that does not align to a UTF-8 boundary: ${offset}.`,
    },
  });
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

function openNativeSentenceSplitter(options: SentenceSplitterOptions): NativeSentenceSplitterSession {
  const library = loadSentenceSplitterLibrary(options);
  return openNativeHandleSession(
    library,
    readSentenceSpanResultLayout,
    (loadedLibrary, handleOut) =>
      loadedLibrary.symbols.sudachi_create_sentence_splitter(
        options.configPath ?? null,
        options.resourceDir ?? null,
        options.dictPath,
        handleOut,
      ),
    (loadedLibrary, status) =>
      createNativeSudachiError(loadedLibrary, status, "Failed to create the sentence splitter."),
    "Sentence splitter handle was null after initialization.",
  );
}

export class SentenceSplitter {
  #library: NativeSentenceSplitterLibrary | null;
  #layout: SentenceSpanResultLayout | null;
  #handle: Pointer | null;

  constructor(session: NativeSentenceSplitterSession) {
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

    return readOwnedNativeResult(
      resultOut,
      "Sentence splitter returned a null result pointer.",
      (resultPtr) => library.symbols.sudachi_free_sentence_spans(resultPtr),
      (resultPtr) => materializeSentenceSpans(text, readSentenceSpanArray(resultPtr, layout)),
    );
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

export function createSentenceSplitter(options: SentenceSplitterOptions): SentenceSplitter {
  return new SentenceSplitter(openNativeSentenceSplitter(options));
}
