import { expect, spyOn, test } from "bun:test";

import * as ffi from "./ffi.ts";
import * as native from "./native.ts";
import { Tokenizer } from "./core.ts";
import type { Morpheme, TokenizeMode } from "./types.ts";
import type { MorphemeResultLayout, NativeSudachiLibrary } from "./native.ts";

const MORPHEME_LAYOUT: MorphemeResultLayout = {
  layoutVersion: 1,
  arrayLayoutKind: 0,
  arrayItemsOffset: 0,
  arrayLenOffset: 8,
  resultSize: 96,
  surfaceOffset: 0,
  normalizedOffset: 8,
  dictionaryFormOffset: 16,
  readingOffset: 24,
  posOffset: 32,
  beginOffset: 40,
  endOffset: 48,
  wordIdOffset: 56,
  posIdOffset: 64,
  dictionaryIdOffset: 68,
  isOovOffset: 72,
  synonymGroupIdsOffset: 80,
  synonymGroupIdsLenOffset: 88,
};

function createMorpheme(surface: string, begin: number, end: number): Morpheme {
  return {
    surface,
    normalized: surface,
    dictionaryForm: surface,
    reading: surface,
    pos: "名詞,普通名詞,一般,*,*,*",
    begin,
    end,
    wordId: `${surface}-${begin}`,
    posId: 0,
    dictionaryId: 0,
    isOov: false,
    synonymGroupIds: [],
  };
}

function createMockLibrary(): NativeSudachiLibrary {
  return {
    symbols: {
      sudachi_create_tokenizer: (_configPath, _resourceDir, _dictPath, outHandle) => {
        (outHandle as BigUint64Array)[0] = 1n;
        return 0;
      },
      sudachi_free_tokenizer: () => {},
      sudachi_tokenize: (_handle, _input, mode, outResult) => {
        (outResult as BigUint64Array)[0] = mode === 0 ? 40n : 2n;
        return 0;
      },
      sudachi_split_morpheme: (_handle, _input, sourceMode, index, splitMode, outResult) => {
        if (sourceMode === 2 && splitMode === 0 && index === 0) {
          (outResult as BigUint64Array)[0] = 30n;
          return 0;
        }

        if (sourceMode === 2 && splitMode === 0 && index === 1) {
          (outResult as BigUint64Array)[0] = 31n;
          return 0;
        }

        if (sourceMode === 0 && splitMode === 0 && index === 0) {
          (outResult as BigUint64Array)[0] = 32n;
          return 0;
        }

        if (sourceMode === 0 && splitMode === 0 && index === 1) {
          (outResult as BigUint64Array)[0] = 33n;
          return 0;
        }

        (outResult as BigUint64Array)[0] = 30n;
        return 0;
      },
      sudachi_split_morphemes: (_handle, _input, _sourceMode, _splitMode, outResult) => {
        (outResult as BigUint64Array)[0] = 40n;
        return 0;
      },
      sudachi_free_result: () => {},
      sudachi_get_morpheme_result_layout: () => 0,
      sudachi_get_last_error: () => "native error" as never,
      sudachi_status_code_name: () => "UNKNOWN" as never,
    },
    close: () => {},
  };
}

function withTokenizer(
  run: (options: {
    library: NativeSudachiLibrary;
    tokenizer: Tokenizer;
    readSpy: ReturnType<typeof spyOn<typeof ffi, "readMorphemeArray">>;
    loadSpy: ReturnType<typeof spyOn<typeof native, "loadNativeLibrary">>;
    layoutSpy: ReturnType<typeof spyOn<typeof native, "readMorphemeResultLayout">>;
  }) => void,
): void {
  const library = createMockLibrary();
  const loadSpy = spyOn(native, "loadNativeLibrary").mockReturnValue(library);
  const layoutSpy = spyOn(native, "readMorphemeResultLayout").mockReturnValue(MORPHEME_LAYOUT);
  const readSpy = spyOn(ffi, "readMorphemeArray").mockImplementation((resultPtr) => {
    switch (Number(resultPtr)) {
      case 2:
        return [createMorpheme("東京都", 0, 9), createMorpheme("に", 9, 12)];
      case 30:
        return [createMorpheme("東京", 0, 6), createMorpheme("都", 6, 9)];
      case 31:
        return [createMorpheme("に", 9, 12)];
      case 32:
        return [createMorpheme("東京", 0, 6)];
      case 33:
        return [createMorpheme("都", 6, 9)];
      case 40:
        return [createMorpheme("東京", 0, 6), createMorpheme("都", 6, 9), createMorpheme("に", 9, 12)];
      default:
        return [];
    }
  });
  const tokenizer = Tokenizer.create({ dictPath: "/tmp/dict" });

  try {
    run({ library, tokenizer, readSpy, loadSpy, layoutSpy });
  } finally {
    tokenizer.close();
    readSpy.mockRestore();
    layoutSpy.mockRestore();
    loadSpy.mockRestore();
  }
}

test("split uses the native morpheme resplit symbol and reuses the decoder", () => {
  withTokenizer(({ library, tokenizer, readSpy }) => {
    const splitSpy = spyOn(library.symbols, "sudachi_split_morpheme");
    const freeSpy = spyOn(library.symbols, "sudachi_free_result");
    const morphemes = tokenizer.tokenize("東京都に", "C");

    try {
      expect(tokenizer.split(morphemes[0]!, "A")).toEqual([
        createMorpheme("東京", 0, 6),
        createMorpheme("都", 6, 9),
      ]);
      expect(splitSpy).toHaveBeenCalledTimes(1);
      expect(splitSpy).toHaveBeenCalledWith(1 as never, "東京都に", 2, 0, 0, expect.any(BigUint64Array));
      expect(readSpy).toHaveBeenCalledTimes(2);
    } finally {
      splitSpy.mockRestore();
      freeSpy.mockRestore();
    }
  });
});

test("splitInto uses the native whole-list split symbol for owned lists", () => {
  withTokenizer(({ library, tokenizer }) => {
    const listSplitSpy = spyOn(library.symbols, "sudachi_split_morphemes");
    const singleSplitSpy = spyOn(library.symbols, "sudachi_split_morpheme");
    const morphemes = tokenizer.tokenize("東京都に", "C");

    try {
      expect(tokenizer.splitInto(morphemes, "A")).toEqual([
        createMorpheme("東京", 0, 6),
        createMorpheme("都", 6, 9),
        createMorpheme("に", 9, 12),
      ]);
      expect(listSplitSpy).toHaveBeenCalledTimes(1);
      expect(listSplitSpy).toHaveBeenCalledWith(1 as never, "東京都に", 2, 0, expect.any(BigUint64Array));
      expect(singleSplitSpy).not.toHaveBeenCalled();
    } finally {
      singleSplitSpy.mockRestore();
      listSplitSpy.mockRestore();
    }
  });
});

test("splitInto on a split result stays on the per-morpheme path", () => {
  withTokenizer(({ library, tokenizer }) => {
    const listSplitSpy = spyOn(library.symbols, "sudachi_split_morphemes");
    const singleSplitSpy = spyOn(library.symbols, "sudachi_split_morpheme");
    const morphemes = tokenizer.tokenize("東京都に", "C");
    const splitResult = tokenizer.split(morphemes[0]!, "A");

    try {
      expect(tokenizer.splitInto(splitResult, "A")).toEqual([
        createMorpheme("東京", 0, 6),
        createMorpheme("都", 6, 9),
      ]);
      expect(listSplitSpy).not.toHaveBeenCalled();
      expect(singleSplitSpy).toHaveBeenCalledTimes(3);
      expect(singleSplitSpy).toHaveBeenNthCalledWith(1, 1 as never, "東京都に", 2, 0, 0, expect.any(BigUint64Array));
      expect(singleSplitSpy).toHaveBeenNthCalledWith(2, 1 as never, "東京都に", 0, 0, 0, expect.any(BigUint64Array));
      expect(singleSplitSpy).toHaveBeenNthCalledWith(3, 1 as never, "東京都に", 0, 1, 0, expect.any(BigUint64Array));
    } finally {
      singleSplitSpy.mockRestore();
      listSplitSpy.mockRestore();
    }
  });
});

test("splitInto falls back when a tokenize result array was mutated", () => {
  withTokenizer(({ library, tokenizer }) => {
    const listSplitSpy = spyOn(library.symbols, "sudachi_split_morphemes");
    const singleSplitSpy = spyOn(library.symbols, "sudachi_split_morpheme");
    const morphemes = tokenizer.tokenize("東京都に", "C");
    morphemes.pop();

    try {
      expect(tokenizer.splitInto(morphemes, "A")).toEqual([
        createMorpheme("東京", 0, 6),
        createMorpheme("都", 6, 9),
      ]);
      expect(listSplitSpy).not.toHaveBeenCalled();
      expect(singleSplitSpy).toHaveBeenCalledTimes(1);
      expect(singleSplitSpy).toHaveBeenCalledWith(1 as never, "東京都に", 2, 0, 0, expect.any(BigUint64Array));
    } finally {
      singleSplitSpy.mockRestore();
      listSplitSpy.mockRestore();
    }
  });
});

test("splitInto falls back to per-morpheme splits for copied lists", () => {
  withTokenizer(({ library, tokenizer }) => {
    const listSplitSpy = spyOn(library.symbols, "sudachi_split_morphemes");
    const singleSplitSpy = spyOn(library.symbols, "sudachi_split_morpheme");
    const morphemes = tokenizer.tokenize("東京都に", "C");
    const copied = [...morphemes];

    try {
      expect(tokenizer.splitInto(copied, "A")).toEqual([
        createMorpheme("東京", 0, 6),
        createMorpheme("都", 6, 9),
        createMorpheme("に", 9, 12),
      ]);
      expect(listSplitSpy).not.toHaveBeenCalled();
      expect(singleSplitSpy).toHaveBeenCalledTimes(2);
      expect(singleSplitSpy).toHaveBeenNthCalledWith(1, 1 as never, "東京都に", 2, 0, 0, expect.any(BigUint64Array));
      expect(singleSplitSpy).toHaveBeenNthCalledWith(2, 1 as never, "東京都に", 2, 1, 0, expect.any(BigUint64Array));
    } finally {
      singleSplitSpy.mockRestore();
      listSplitSpy.mockRestore();
    }
  });
});

test("split rejects morphemes that were not created by the tokenizer", () => {
  withTokenizer(({ tokenizer }) => {
    expect(() => tokenizer.split(createMorpheme("東京都", 0, 9), "A")).toThrow(
      "Morpheme was not created by this tokenizer.",
    );
  });
});
