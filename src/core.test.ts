import { expect, spyOn, test } from "bun:test";

import * as ffi from "./ffi.ts";
import * as native from "./native.ts";
import { PosMatcher, Tokenizer, createTokenizer } from "./core.ts";
import type { LookupEntry, Morpheme } from "./types.ts";
import type {
  LookupResultLayout,
  MorphemeResultLayout,
  NativeLookupLibrary,
  NativeSudachiLibrary,
  PosMatcherResultLayout,
} from "./native.ts";

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

const LOOKUP_LAYOUT: LookupResultLayout = {
  layoutVersion: 1,
  arrayLayoutKind: 0,
  arrayItemsOffset: 0,
  arrayLenOffset: 8,
  resultSize: 40,
  surfaceOffset: 0,
  posOffset: 8,
  wordIdOffset: 16,
  posIdOffset: 24,
  dictionaryIdOffset: 28,
  isOovOffset: 32,
};

const POS_MATCHER_LAYOUT: PosMatcherResultLayout = {
  layoutVersion: 1,
  arrayLayoutKind: 0,
  arrayItemsOffset: 0,
  arrayLenOffset: 8,
  resultSize: 2,
};

function createMorpheme(surface: string, begin: number, end: number, posId = 0): Morpheme {
  return {
    surface,
    normalized: surface,
    dictionaryForm: surface,
    reading: surface,
    pos: "名詞,普通名詞,一般,*,*,*",
    begin,
    end,
    wordId: `${surface}-${begin}`,
    posId,
    dictionaryId: 0,
    isOov: false,
    synonymGroupIds: [],
  };
}

function createLookupEntry(surface: string, wordId: string, dictionaryId: number, isOov: boolean, posId = 0): LookupEntry {
  return {
    surface,
    pos: "名詞,普通名詞,一般,*,*,*",
    wordId,
    posId,
    dictionaryId,
    isOov,
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
      sudachi_compile_pos_matcher: (_handle, _patternsJson, outResult) => {
        (outResult as BigUint64Array)[0] = 60n;
        return 0;
      },
      sudachi_free_result: () => {},
      sudachi_free_pos_matcher_result: () => {},
      sudachi_get_morpheme_result_layout: () => 0,
      sudachi_get_pos_matcher_result_layout: () => 0,
      sudachi_get_last_error: () => "native error" as never,
      sudachi_status_code_name: () => "UNKNOWN" as never,
    },
    close: () => {},
  };
}

function createMockLookupLibrary(): NativeLookupLibrary {
  return {
    symbols: {
      sudachi_lookup: (_handle, surface, outResult) => {
        (outResult as BigUint64Array)[0] = surface === "東京" ? 50n : 51n;
        return 0;
      },
      sudachi_free_lookup_result: () => {},
      sudachi_get_lookup_result_layout: () => 0,
      sudachi_get_last_error: () => "native error" as never,
      sudachi_status_code_name: () => "UNKNOWN" as never,
    },
    close: () => {},
  };
}

function withTokenizer(
  run: (options: {
    library: NativeSudachiLibrary;
    lookupLibrary: NativeLookupLibrary;
    tokenizer: Tokenizer;
    readSpy: ReturnType<typeof spyOn<typeof ffi, "readMorphemeArray">>;
    readLookupSpy: ReturnType<typeof spyOn<typeof ffi, "readLookupEntryArray">>;
    readPosMatcherSpy: ReturnType<typeof spyOn<typeof ffi, "readPosMatcherIdArray">>;
    loadSpy: ReturnType<typeof spyOn<typeof native, "loadNativeLibrary">>;
    lookupLoadSpy: ReturnType<typeof spyOn<typeof native, "loadLookupLibrary">>;
    layoutSpy: ReturnType<typeof spyOn<typeof native, "readMorphemeResultLayout">>;
    lookupLayoutSpy: ReturnType<typeof spyOn<typeof native, "readLookupResultLayout">>;
    posMatcherLayoutSpy: ReturnType<typeof spyOn<typeof native, "readPosMatcherResultLayout">>;
  }) => void,
): void {
  const library = createMockLibrary();
  const lookupLibrary = createMockLookupLibrary();
  const loadSpy = spyOn(native, "loadNativeLibrary").mockReturnValue(library);
  const lookupLoadSpy = spyOn(native, "loadLookupLibrary").mockReturnValue(lookupLibrary);
  const layoutSpy = spyOn(native, "readMorphemeResultLayout").mockReturnValue(MORPHEME_LAYOUT);
  const lookupLayoutSpy = spyOn(native, "readLookupResultLayout").mockReturnValue(LOOKUP_LAYOUT);
  const posMatcherLayoutSpy = spyOn(native, "readPosMatcherResultLayout").mockReturnValue(POS_MATCHER_LAYOUT);
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
  const readLookupSpy = spyOn(ffi, "readLookupEntryArray").mockImplementation((resultPtr) => {
    switch (Number(resultPtr)) {
      case 50:
        return [createLookupEntry("東京", "(0, 5)", 0, false), createLookupEntry("東京", "(0, 6)", 0, false)];
      case 51:
        return [createLookupEntry("に", "(0, 1)", 0, false)];
      default:
        return [];
    }
  });
  const readPosMatcherSpy = spyOn(ffi, "readPosMatcherIdArray").mockImplementation((resultPtr) => {
    switch (Number(resultPtr)) {
      case 60:
        return [1, 3];
      default:
        return [];
    }
  });
  const tokenizer = createTokenizer({ dictPath: "/tmp/dict" });

  try {
    run({
      library,
      lookupLibrary,
      tokenizer,
      readSpy,
      readLookupSpy,
      readPosMatcherSpy,
      loadSpy,
      lookupLoadSpy,
      layoutSpy,
      lookupLayoutSpy,
      posMatcherLayoutSpy,
    });
  } finally {
    tokenizer.close();
    readPosMatcherSpy.mockRestore();
    readLookupSpy.mockRestore();
    lookupLayoutSpy.mockRestore();
    posMatcherLayoutSpy.mockRestore();
    lookupLoadSpy.mockRestore();
    readSpy.mockRestore();
    layoutSpy.mockRestore();
    loadSpy.mockRestore();
  }
}

test("lookup uses the dedicated native lookup symbol and decoder", () => {
  withTokenizer(({ lookupLibrary, tokenizer, readLookupSpy }) => {
    const lookupSpy = spyOn(lookupLibrary.symbols, "sudachi_lookup");
    const freeSpy = spyOn(lookupLibrary.symbols, "sudachi_free_lookup_result");

    try {
      expect(tokenizer.lookup("東京")).toEqual([
        createLookupEntry("東京", "(0, 5)", 0, false),
        createLookupEntry("東京", "(0, 6)", 0, false),
      ]);
      expect(lookupSpy).toHaveBeenCalledTimes(1);
      expect(lookupSpy).toHaveBeenCalledWith(1 as never, "東京", expect.any(BigUint64Array));
      expect(readLookupSpy).toHaveBeenCalledTimes(1);
      expect(freeSpy).toHaveBeenCalledTimes(1);
      expect(freeSpy).toHaveBeenCalledWith(50 as never);
    } finally {
      freeSpy.mockRestore();
      lookupSpy.mockRestore();
    }
  });
});

test("createPosMatcher compiles native POS matcher ids and filters morphemes and lookup entries", () => {
  withTokenizer(({ library, tokenizer, readPosMatcherSpy }) => {
    const compileSpy = spyOn(library.symbols, "sudachi_compile_pos_matcher");
    const freeSpy = spyOn(library.symbols, "sudachi_free_pos_matcher_result");

    try {
      const matcher = tokenizer.createPosMatcher([["名詞"], [null, null, null, null, null, "終止形-一般"]]);
      expect(matcher).toBeInstanceOf(PosMatcher);
      expect(compileSpy).toHaveBeenCalledTimes(1);
      expect(compileSpy).toHaveBeenCalledWith(
        1 as never,
        JSON.stringify([["名詞", null, null, null, null, null], [null, null, null, null, null, "終止形-一般"]]),
        expect.any(BigUint64Array),
      );
      expect(readPosMatcherSpy).toHaveBeenCalledTimes(1);
      expect(freeSpy).toHaveBeenCalledTimes(1);

      const morphemes = [
        createMorpheme("東京", 0, 6, 1),
        createMorpheme("都", 6, 9, 2),
        createMorpheme("に", 9, 12, 3),
      ];
      expect(matcher.matches(1)).toBe(true);
      expect(matcher.matches(2)).toBe(false);
      expect(matcher.filter(morphemes)).toEqual([morphemes[0], morphemes[2]]);

      const lookupEntries = [
        createLookupEntry("東京", "(0, 5)", 0, false, 1),
        createLookupEntry("都", "(0, 6)", 0, false, 2),
        createLookupEntry("に", "(0, 1)", 0, false, 3),
      ];
      expect(matcher.matches(lookupEntries[0]!)).toBe(true);
      expect(matcher.matches(lookupEntries[1]!)).toBe(false);
      expect(matcher.filter(lookupEntries)).toEqual([lookupEntries[0], lookupEntries[2]]);
    } finally {
      freeSpy.mockRestore();
      compileSpy.mockRestore();
    }
  });
});

test("createPosMatcher rejects patterns longer than six entries before calling native code", () => {
  withTokenizer(({ library, tokenizer }) => {
    const compileSpy = spyOn(library.symbols, "sudachi_compile_pos_matcher");

    try {
      expect(() => tokenizer.createPosMatcher([["a", "b", "c", "d", "e", "f", "g"]])).toThrow(
        "POS matcher patterns must have at most 6 items.",
      );
      expect(compileSpy).not.toHaveBeenCalled();
    } finally {
      compileSpy.mockRestore();
    }
  });
});

test("lookup loads the lookup library lazily and reuses its layout", () => {
  withTokenizer(({ tokenizer, lookupLoadSpy, lookupLayoutSpy }) => {
    tokenizer.tokenize("東京都に", "C");
    expect(lookupLoadSpy).not.toHaveBeenCalled();
    expect(lookupLayoutSpy).not.toHaveBeenCalled();

    expect(tokenizer.lookup("東京")).toEqual([
      createLookupEntry("東京", "(0, 5)", 0, false),
      createLookupEntry("東京", "(0, 6)", 0, false),
    ]);
    expect(tokenizer.lookup("に")).toEqual([createLookupEntry("に", "(0, 1)", 0, false)]);
    expect(lookupLoadSpy).toHaveBeenCalledTimes(1);
    expect(lookupLayoutSpy).toHaveBeenCalledTimes(1);
  });
});

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

test("createTokenizer closes the native library when initialization fails", () => {
  const library = createMockLibrary();
  const loadSpy = spyOn(native, "loadNativeLibrary").mockReturnValue(library);
  const layoutSpy = spyOn(native, "readMorphemeResultLayout").mockReturnValue(MORPHEME_LAYOUT);
  const createSpy = spyOn(library.symbols, "sudachi_create_tokenizer").mockReturnValue(7);
  const closeSpy = spyOn(library, "close");

  try {
    expect(() => createTokenizer({ dictPath: "/tmp/dict" })).toThrow("native error");
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledTimes(1);
  } finally {
    closeSpy.mockRestore();
    createSpy.mockRestore();
    layoutSpy.mockRestore();
    loadSpy.mockRestore();
  }
});
