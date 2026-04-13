import type { Pointer } from "bun:ffi";

import { readSentenceSpanArray, type SentenceSpanOffsets } from "./ffi.ts";
import { createNativeSudachiError } from "./native/error/mapper.ts";
import type {
  NativeSentenceSplitterLibrary,
  SentenceSpanResultLayout,
} from "./native/types.ts";
import {
  loadSentenceSplitterLibrary,
  readSentenceSpanResultLayout,
} from "./native.ts";
import {
  openNativeHandleSession,
  readOwnedNativeResult,
} from "./native-session.ts";
import { createUtf8ByteOffsetIndexMap } from "./shared/utf8-offset.ts";
import {
  type SentenceSpan,
  type SentenceSplitterOptions,
  SudachiError,
} from "./types.ts";

function invalidSentenceSpan(message: string): never {
  throw new SudachiError(message, {
    code: "INTERNAL",
    nativeStatus: 255,
  });
}

function materializeSentenceSpans(
  text: string,
  offsets: SentenceSpanOffsets[],
): SentenceSpan[] {
  if (offsets.length === 0) {
    return [];
  }

  const boundaries: number[] = [];
  for (const { start, end } of offsets) {
    if (start > end) {
      invalidSentenceSpan(
        `Sentence splitter returned an inverted span: ${start}..${end}.`,
      );
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
      invalidSentenceSpan(
        `Sentence splitter returned an unreadable span: ${start}..${end}.`,
      );
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

interface SentenceSplitterState {
  library: NativeSentenceSplitterLibrary | null;
  layout: SentenceSpanResultLayout | null;
  handle: Pointer | null;
}

interface ExistingSentenceSplitterState {
  state: SentenceSplitterState;
}

function openNativeSentenceSplitter(
  options: SentenceSplitterOptions,
): NativeSentenceSplitterSession {
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
      createNativeSudachiError(
        loadedLibrary,
        status,
        "Failed to create the sentence splitter.",
      ),
    "Sentence splitter handle was null after initialization.",
  );
}

export class SentenceSplitter {
  #state: SentenceSplitterState;
  #limit: number | null;

  constructor(
    session: NativeSentenceSplitterSession | ExistingSentenceSplitterState,
    limit: number | null = null,
  ) {
    this.#state =
      "state" in session
        ? session.state
        : {
            library: session.library,
            layout: session.layout,
            handle: session.handle,
          };
    this.#limit = limit;
  }

  get closed(): boolean {
    return (
      this.#state.library === null ||
      this.#state.handle === null ||
      this.#state.layout === null
    );
  }

  withLimit(limit: number): SentenceSplitter {
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 2_147_483_647) {
      throw new SudachiError("limit must be a positive integer.", {
        code: "INVALID_ARGUMENT",
      });
    }

    return new SentenceSplitter({ state: this.#state }, limit);
  }

  #requireOpen(): {
    library: NativeSentenceSplitterLibrary;
    layout: SentenceSpanResultLayout;
    handle: Pointer;
  } {
    const library = this.#state.library;
    const layout = this.#state.layout;
    const handle = this.#state.handle;
    if (library === null || layout === null || handle === null) {
      throw new SudachiError("Sentence splitter has been closed.", {
        code: "SENTENCE_SPLITTER_CLOSED",
      });
    }

    return { library, layout, handle };
  }

  getEos(text: string): number | null {
    const { library, handle } = this.#requireOpen();

    if (text.length === 0) {
      return null;
    }

    const eosOut = new BigUint64Array(1);
    const foundOut = new Int32Array(1);
    const status =
      this.#limit === null
        ? library.symbols.sudachi_get_eos?.(handle, text, eosOut, foundOut)
        : library.symbols.sudachi_get_eos_with_limit?.(
            handle,
            text,
            this.#limit,
            eosOut,
            foundOut,
          );
    if (status === undefined) {
      throw new SudachiError("Sentence detector API is not available.", {
        code: "INTERNAL",
        nativeStatus: 255,
      });
    }
    if (status !== 0) {
      throw createNativeSudachiError(
        library,
        status,
        "Sentence boundary detection failed.",
      );
    }

    const eosRaw = eosOut[0] ?? 0n;
    if ((foundOut[0] ?? 0) === 0) {
      return null;
    }
    if (eosRaw > BigInt(Number.MAX_SAFE_INTEGER)) {
      invalidSentenceSpan(
        `Sentence splitter returned an out-of-range byte offset: ${eosRaw.toString()}.`,
      );
    }

    const eos = Number(eosRaw);
    createUtf8ByteOffsetIndexMap(text, [eos], {
      throwInvalid: invalidSentenceSpan,
      messages: {
        outOfRange: (offset) =>
          `Sentence splitter returned an out-of-range byte offset: ${offset}.`,
        notBoundary: (offset) =>
          `Sentence splitter returned a byte offset that does not align to a UTF-8 boundary: ${offset}.`,
      },
    });
    return eos;
  }

  split(text: string): SentenceSpan[] {
    const { library, layout, handle } = this.#requireOpen();

    if (text.length === 0) {
      return [];
    }

    const resultOut = new BigUint64Array(1);
    const status = library.symbols.sudachi_split_sentences(
      handle,
      text,
      resultOut,
    );
    if (status !== 0) {
      throw createNativeSudachiError(
        library,
        status,
        "Sentence splitting failed.",
      );
    }

    return readOwnedNativeResult(
      resultOut,
      "Sentence splitter returned a null result pointer.",
      (resultPtr) => library.symbols.sudachi_free_sentence_spans(resultPtr),
      (resultPtr) =>
        materializeSentenceSpans(
          text,
          readSentenceSpanArray(resultPtr, layout),
        ),
    );
  }

  close(): void {
    const library = this.#state.library;
    if (library === null) {
      return;
    }

    if (this.#state.handle !== null) {
      library.symbols.sudachi_free_sentence_splitter(this.#state.handle);
    }

    this.#state.handle = null;
    this.#state.layout = null;
    library.close();
    this.#state.library = null;
  }

  [Symbol.dispose](): void {
    this.close();
  }
}

export function createSentenceSplitter(
  options: SentenceSplitterOptions,
): SentenceSplitter {
  return new SentenceSplitter(openNativeSentenceSplitter(options));
}
