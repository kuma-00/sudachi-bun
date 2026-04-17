import { expect, spyOn, test } from "bun:test";
import { createTokenizer, PosMatcher, type Tokenizer } from "./core.ts";
import * as ffi from "./ffi.ts";
import type {
  LookupResultLayout,
  MorphemeResultLayout,
  NativeLookupLibrary,
  NativeSudachiLibrary,
  PosMatcherResultLayout,
} from "./native/types.ts";
import * as native from "./native.ts";
import type { LookupEntry, Morpheme } from "./types.ts";
import { SudachiError } from "./types.ts";

const INFO_SUBSET_FFI_POS_TEXT_BIT = 1 << 30;
const DEFAULT_PROJECTION = "surface";
const PROJECTION_VALUES = new Set([
  "surface",
  "normalized",
  "dictionary_form",
  "reading",
  "dictionary_and_surface",
  "normalized_and_surface",
  "normalized_nouns",
]);

const MORPHEME_LAYOUT: MorphemeResultLayout = {
  layoutVersion: 1,
  arrayLayoutKind: 0,
  arrayItemsOffset: 0,
  arrayLenOffset: 8,
  arrayInternalCostOffset: 16,
  resultSize: 112,
  surfaceOffset: 0,
  normalizedOffset: 8,
  dictionaryFormOffset: 16,
  readingOffset: 24,
  posOffset: 32,
  beginOffset: 40,
  endOffset: 48,
  beginCharOffset: 56,
  endCharOffset: 64,
  wordIdOffset: 72,
  posIdOffset: 80,
  dictionaryIdOffset: 84,
  isOovOffset: 88,
  totalCostOffset: 92,
  headWordLengthOffset: 0,
  splitAOffset: 0,
  splitALenOffset: 0,
  splitBOffset: 0,
  splitBLenOffset: 0,
  wordStructureOffset: 0,
  wordStructureLenOffset: 0,
  synonymGroupIdsOffset: 96,
  synonymGroupIdsLenOffset: 104,
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
  headWordLengthOffset: 0,
  splitAOffset: 0,
  splitALenOffset: 0,
  splitBOffset: 0,
  splitBLenOffset: 0,
  wordStructureOffset: 0,
  wordStructureLenOffset: 0,
};

const POS_MATCHER_LAYOUT: PosMatcherResultLayout = {
  layoutVersion: 1,
  arrayLayoutKind: 0,
  arrayItemsOffset: 0,
  arrayLenOffset: 8,
  resultSize: 2,
};

type MorphemeListWithInternalCost = Morpheme[] & {
  internalCost: number;
};

function createMorpheme(
  surface: string,
  begin: number,
  end: number,
  posId = 0,
  totalCost = 0,
): Morpheme {
  return {
    surface,
    headWordLength: 0,
    normalized: surface,
    dictionaryForm: surface,
    reading: surface,
    pos: "名詞,普通名詞,一般,*,*,*",
    begin,
    end,
    beginChar: begin,
    endChar: end,
    wordId: `${surface}-${begin}`,
    posId,
    dictionaryId: 0,
    isOov: false,
    totalCost,
    splitA: [],
    splitB: [],
    wordStructure: [],
    synonymGroupIds: [],
  };
}

function createSubsetMorpheme(
  surface: string,
  begin: number,
  end: number,
  posId = 0,
  pos = "",
  totalCost = 0,
  headWordLength = 0,
  splitA: string[] = [],
  splitB: string[] = [],
  wordStructure: string[] = [],
): Morpheme {
  return {
    surface,
    headWordLength,
    normalized: "",
    dictionaryForm: "",
    reading: "",
    pos,
    begin,
    end,
    beginChar: begin,
    endChar: end,
    wordId: `${surface}-${begin}`,
    posId,
    dictionaryId: 0,
    isOov: false,
    totalCost,
    splitA,
    splitB,
    wordStructure,
    synonymGroupIds: [],
  };
}

function createLookupEntry(
  surface: string,
  wordId: string,
  dictionaryId: number,
  isOov: boolean,
  posId = 0,
): LookupEntry {
  return {
    surface,
    headWordLength: 0,
    pos: "名詞,普通名詞,一般,*,*,*",
    wordId,
    posId,
    dictionaryId,
    isOov,
    splitA: [],
    splitB: [],
    wordStructure: [],
  };
}

function requireDefined<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`${label} is undefined`);
  }

  return value;
}

function withInternalCost(
  morphemes: Morpheme[],
  internalCost: number,
): MorphemeListWithInternalCost {
  return Object.assign(morphemes, { internalCost });
}

function createSubsetLookupEntry(
  surface: string,
  wordId: string,
  dictionaryId: number,
  isOov: boolean,
  posId = 0,
  pos = "",
  headWordLength = 0,
  splitA: string[] = [],
  splitB: string[] = [],
  wordStructure: string[] = [],
): LookupEntry {
  return {
    surface,
    headWordLength,
    pos,
    wordId,
    posId,
    dictionaryId,
    isOov,
    splitA,
    splitB,
    wordStructure,
  };
}

function projectionArg(
  args: readonly unknown[],
  index: number,
): string | undefined {
  const value = args[index];
  return typeof value === "string" && PROJECTION_VALUES.has(value)
    ? value
    : undefined;
}

function surfaceArg(
  args: readonly unknown[],
  index: number,
): string | undefined {
  const value = args[index];
  return typeof value === "string" && !PROJECTION_VALUES.has(value)
    ? value
    : undefined;
}

function resultBufferArg(
  args: readonly unknown[],
  index: number,
): BigUint64Array | undefined {
  const value = args[index];
  return value instanceof BigUint64Array ? value : undefined;
}

function createMockLibrary(): NativeSudachiLibrary {
  let statefulMode = 2;
  let statefulSubsetBits = -1;

  return {
    symbols: {
      sudachi_create_tokenizer: (
        _configPath,
        _resourceDir,
        _dictPath,
        outHandle,
      ) => {
        (outHandle as BigUint64Array)[0] = 1n;
        return 0;
      },
      sudachi_free_tokenizer: () => {},
      sudachi_create_stateful_tokenizer_from_tokenizer: (
        _tokenizerHandle,
        outHandle,
      ) => {
        statefulMode = 2;
        statefulSubsetBits = -1;
        (outHandle as BigUint64Array)[0] = 101n;
        return 0;
      },
      sudachi_free_stateful_tokenizer: () => {},
      sudachi_stateful_tokenizer_reset: () => 0,
      sudachi_stateful_tokenizer_set_mode: (_handle, mode) => {
        statefulMode = mode;
        return 0;
      },
      sudachi_stateful_tokenizer_set_subset: (_handle, subsetBits) => {
        statefulSubsetBits = subsetBits;
        return 0;
      },
      sudachi_stateful_tokenizer_do_tokenize: (
        _handle,
        _projection,
        outResult,
      ) => {
        if (statefulMode === 0) {
          (outResult as BigUint64Array)[0] = 40n;
          return 0;
        }

        if (
          statefulMode === 2 &&
          statefulSubsetBits === ((1 << 0) | (1 << 2))
        ) {
          (outResult as BigUint64Array)[0] = 41n;
          return 0;
        }

        (outResult as BigUint64Array)[0] = 2n;
        return 0;
      },
      sudachi_tokenize: (...args) => {
        const projection = projectionArg(args, 3);
        void projection;
        const outResult = resultBufferArg(args, 4);
        const mode = typeof args[2] === "number" ? args[2] : -1;
        if (!outResult) {
          throw new Error("tokenize result buffer missing");
        }
        outResult[0] = mode === 0 ? 40n : 2n;
        return 0;
      },
      sudachi_tokenize_subset: (...args) => {
        const projection = projectionArg(args, 3);
        void projection;
        const outResult = resultBufferArg(args, 5);
        const mode = typeof args[2] === "number" ? args[2] : -1;
        const subsetBits = typeof args[4] === "number" ? args[4] : -1;
        if (!outResult) {
          throw new Error("tokenize subset result buffer missing");
        }
        if (mode === 2 && subsetBits === ((1 << 0) | (1 << 2))) {
          outResult[0] = 41n;
          return 0;
        }

        if (
          mode === 2 &&
          subsetBits === ((1 << 2) | INFO_SUBSET_FFI_POS_TEXT_BIT)
        ) {
          outResult[0] = 43n;
          return 0;
        }

        if (
          mode === 2 &&
          subsetBits === ((1 << 0) | (1 << 2) | INFO_SUBSET_FFI_POS_TEXT_BIT)
        ) {
          outResult[0] = 44n;
          return 0;
        }

        outResult[0] = 42n;
        return 0;
      },
      sudachi_split_morpheme: (...args) => {
        const projection = projectionArg(args, 3);
        void projection;
        const outResult = resultBufferArg(args, 6);
        const sourceMode = typeof args[2] === "number" ? args[2] : -1;
        const index = typeof args[4] === "number" ? args[4] : -1;
        const splitMode = typeof args[5] === "number" ? args[5] : -1;
        if (!outResult) {
          throw new Error("split morpheme result buffer missing");
        }
        if (sourceMode === 2 && splitMode === 0 && index === 0) {
          outResult[0] = 30n;
          return 0;
        }

        if (sourceMode === 2 && splitMode === 0 && index === 1) {
          outResult[0] = 31n;
          return 0;
        }

        if (sourceMode === 0 && splitMode === 0 && index === 0) {
          outResult[0] = 32n;
          return 0;
        }

        if (sourceMode === 0 && splitMode === 0 && index === 1) {
          outResult[0] = 33n;
          return 0;
        }

        outResult[0] = 30n;
        return 0;
      },
      sudachi_split_morphemes: (...args) => {
        const projection = projectionArg(args, 3);
        void projection;
        const outResult = resultBufferArg(args, 5);
        if (!outResult) {
          throw new Error("split morphemes result buffer missing");
        }
        outResult[0] = 40n;
        return 0;
      },
      sudachi_compile_pos_matcher: (_handle, _patternsJson, outResult) => {
        (outResult as BigUint64Array)[0] = 60n;
        return 0;
      },
      sudachi_inspect_dictionary_bytes: (_bytesPtr, _bytesLen, _outResult) => 0,
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
      sudachi_lookup: (...args) => {
        const projection = projectionArg(args, 2);
        void projection;
        const surface = surfaceArg(args, 1) ?? "";
        const outResult = resultBufferArg(args, 3);
        if (!outResult) {
          throw new Error("lookup result buffer missing");
        }
        outResult[0] = surface === "東京" ? 50n : 51n;
        return 0;
      },
      sudachi_lookup_subset: (...args) => {
        const projection = projectionArg(args, 2);
        void projection;
        const surface = surfaceArg(args, 1) ?? "";
        const outResult = resultBufferArg(args, 4);
        const subsetBits = typeof args[3] === "number" ? args[3] : -1;
        if (!outResult) {
          throw new Error("lookup subset result buffer missing");
        }
        if (surface === "東京" && subsetBits === 1 << 0) {
          outResult[0] = 52n;
          return 0;
        }

        if (
          surface === "東京" &&
          subsetBits === ((1 << 2) | INFO_SUBSET_FFI_POS_TEXT_BIT)
        ) {
          outResult[0] = 54n;
          return 0;
        }

        outResult[0] = 53n;
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
    readPosMatcherSpy: ReturnType<
      typeof spyOn<typeof ffi, "readPosMatcherIdArray">
    >;
    loadSpy: ReturnType<typeof spyOn<typeof native, "loadNativeLibrary">>;
    lookupLoadSpy: ReturnType<typeof spyOn<typeof native, "loadLookupLibrary">>;
    layoutSpy: ReturnType<
      typeof spyOn<typeof native, "readMorphemeResultLayout">
    >;
    lookupLayoutSpy: ReturnType<
      typeof spyOn<typeof native, "readLookupResultLayout">
    >;
    posMatcherLayoutSpy: ReturnType<
      typeof spyOn<typeof native, "readPosMatcherResultLayout">
    >;
  }) => void,
): void {
  const library = createMockLibrary();
  const lookupLibrary = createMockLookupLibrary();
  const loadSpy = spyOn(native, "loadNativeLibrary").mockReturnValue(library);
  const lookupLoadSpy = spyOn(native, "loadLookupLibrary").mockReturnValue(
    lookupLibrary,
  );
  const layoutSpy = spyOn(native, "readMorphemeResultLayout").mockReturnValue(
    MORPHEME_LAYOUT,
  );
  const lookupLayoutSpy = spyOn(
    native,
    "readLookupResultLayout",
  ).mockReturnValue(LOOKUP_LAYOUT);
  const posMatcherLayoutSpy = spyOn(
    native,
    "readPosMatcherResultLayout",
  ).mockReturnValue(POS_MATCHER_LAYOUT);
  const readSpy = spyOn(ffi, "readMorphemeArray").mockImplementation(
    (resultPtr, _layout) => {
      switch (Number(resultPtr)) {
        case 2:
          return withInternalCost(
            [createMorpheme("東京都", 0, 9), createMorpheme("に", 9, 12)],
            0,
          );
        case 30:
          return withInternalCost(
            [createMorpheme("東京", 0, 6), createMorpheme("都", 6, 9)],
            0,
          );
        case 31:
          return withInternalCost([createMorpheme("に", 9, 12)], 0);
        case 32:
          return withInternalCost([createMorpheme("東京", 0, 6)], 0);
        case 33:
          return withInternalCost([createMorpheme("都", 6, 9)], 0);
        case 40:
          return withInternalCost(
            [
              createMorpheme("東京", 0, 6),
              createMorpheme("都", 6, 9),
              createMorpheme("に", 9, 12),
            ],
            0,
          );
        case 41:
          return withInternalCost(
            [
              createSubsetMorpheme("東京", 0, 6, 7),
              createSubsetMorpheme("都", 6, 9, 8),
              createSubsetMorpheme("に", 9, 12, 9),
            ],
            0,
          );
        case 42:
          return withInternalCost(
            [
              createSubsetMorpheme(
                "東京",
                0,
                6,
                11,
                "",
                0,
                2,
                ["(0, 1001)", "(0, 1002)"],
                ["(0, 2001)"],
                ["(0, 3001)", "(0, 3002)", "(0, 3003)"],
              ),
            ],
            0,
          );
        case 43:
          return withInternalCost(
            [
              createSubsetMorpheme(
                "東京",
                0,
                6,
                12,
                "名詞,普通名詞,一般,*,*,*",
              ),
            ],
            0,
          );
        case 44:
          return withInternalCost(
            [
              createSubsetMorpheme(
                "東京",
                0,
                6,
                13,
                "名詞,普通名詞,一般,*,*,*",
              ),
              createSubsetMorpheme("都", 6, 9, 14, "名詞,普通名詞,一般,*,*,*"),
              createSubsetMorpheme("に", 9, 12, 15, "助詞,格助詞,*,*,*,*"),
            ],
            0,
          );
        default:
          return withInternalCost([], 0);
      }
    },
  );
  const readLookupSpy = spyOn(ffi, "readLookupEntryArray").mockImplementation(
    (resultPtr) => {
      switch (Number(resultPtr)) {
        case 50:
          return [
            createLookupEntry("東京", "(0, 5)", 0, false),
            createLookupEntry("東京", "(0, 6)", 0, false),
          ];
        case 51:
          return [createLookupEntry("に", "(0, 1)", 0, false)];
        case 52:
          return [createSubsetLookupEntry("東京", "(0, 5)", 0, false)];
        case 54:
          return [
            createSubsetLookupEntry(
              "東京",
              "(0, 5)",
              0,
              false,
              4,
              "名詞,普通名詞,一般,*,*,*",
            ),
          ];
        case 53:
          return [
            createSubsetLookupEntry(
              "に",
              "(0, 1)",
              0,
              false,
              4,
              "",
              1,
              ["(0, 4001)"],
              ["(0, 5001)", "(0, 5002)"],
              ["(0, 6001)"],
            ),
          ];
        default:
          return [];
      }
    },
  );
  const readPosMatcherSpy = spyOn(
    ffi,
    "readPosMatcherIdArray",
  ).mockImplementation((resultPtr) => {
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
    const subsetLookupSpy = spyOn(
      lookupLibrary.symbols,
      "sudachi_lookup_subset",
    );
    const freeSpy = spyOn(lookupLibrary.symbols, "sudachi_free_lookup_result");

    try {
      expect(
        tokenizer.lookup({ surface: "東京", projection: DEFAULT_PROJECTION }),
      ).toEqual([
        createLookupEntry("東京", "(0, 5)", 0, false),
        createLookupEntry("東京", "(0, 6)", 0, false),
      ]);
      expect(lookupSpy).toHaveBeenCalledTimes(1);
      expect(lookupSpy).toHaveBeenCalledWith(
        1 as never,
        "東京",
        0,
        expect.any(BigUint64Array),
      );
      expect(subsetLookupSpy).not.toHaveBeenCalled();
      expect(readLookupSpy).toHaveBeenCalledTimes(1);
      expect(freeSpy).toHaveBeenCalledTimes(1);
      expect(freeSpy).toHaveBeenCalledWith(50 as never);
    } finally {
      freeSpy.mockRestore();
      subsetLookupSpy.mockRestore();
      lookupSpy.mockRestore();
    }
  });
});

test("tokenize forwards the required projection to the native symbol", () => {
  withTokenizer(({ library, tokenizer, readSpy }) => {
    const tokenizeSpy = spyOn(library.symbols, "sudachi_tokenize");
    const subsetTokenizeSpy = spyOn(library.symbols, "sudachi_tokenize_subset");
    const freeSpy = spyOn(library.symbols, "sudachi_free_result");

    try {
      expect(
        tokenizer.tokenize({
          text: "東京都に",
          projection: DEFAULT_PROJECTION,
          mode: "C",
        }),
      ).toEqual(
        withInternalCost(
          [createMorpheme("東京都", 0, 9), createMorpheme("に", 9, 12)],
          0,
        ),
      );
      expect(tokenizeSpy).toHaveBeenCalledTimes(1);
      expect(tokenizeSpy).toHaveBeenCalledWith(
        1 as never,
        "東京都に",
        2,
        0,
        expect.any(BigUint64Array),
      );
      expect(subsetTokenizeSpy).not.toHaveBeenCalled();
      expect(readSpy).toHaveBeenCalledTimes(1);
      expect(freeSpy).toHaveBeenCalledTimes(1);
      expect(freeSpy).toHaveBeenCalledWith(2 as never);
    } finally {
      freeSpy.mockRestore();
      subsetTokenizeSpy.mockRestore();
      tokenizeSpy.mockRestore();
    }
  });
});

test("tokenize forwards new projection ids to the native symbol", () => {
  withTokenizer(({ library, tokenizer }) => {
    const tokenizeSpy = spyOn(library.symbols, "sudachi_tokenize");
    const projectionCases = [
      ["dictionary_and_surface", 4],
      ["normalized_and_surface", 5],
      ["normalized_nouns", 6],
    ] as const;

    try {
      for (const [projection] of projectionCases) {
        tokenizer.tokenize({
          text: "東京都に",
          projection: projection as never,
          mode: "C",
        });
      }

      expect(tokenizeSpy).toHaveBeenCalledTimes(projectionCases.length);
      for (const [index, [, expectedNative]] of projectionCases.entries()) {
        const call = tokenizeSpy.mock.calls[index];
        expect(call).toBeDefined();
        expect(call?.[3]).toBe(expectedNative);
      }
    } finally {
      tokenizeSpy.mockRestore();
    }
  });
});

test("tokenize exposes internalCost on the returned morpheme list", () => {
  withTokenizer(({ tokenizer, readSpy }) => {
    readSpy.mockImplementationOnce(() =>
      withInternalCost([createMorpheme("東京都", 0, 9)], 321),
    );

    const result = tokenizer.tokenize({
      text: "東京都",
      projection: DEFAULT_PROJECTION,
      mode: "C",
    }) as MorphemeListWithInternalCost;

    expect(result[0]?.totalCost).toBe(0);
    expect(result.internalCost).toBe(321);
  });
});

test("tokenize with fields uses the subset native symbol and omits unrequested fields", () => {
  withTokenizer(({ library, tokenizer, readSpy }) => {
    const tokenizeSpy = spyOn(library.symbols, "sudachi_tokenize");
    const subsetTokenizeSpy = spyOn(library.symbols, "sudachi_tokenize_subset");
    const freeSpy = spyOn(library.symbols, "sudachi_free_result");

    try {
      expect(
        tokenizer.tokenize({
          text: "東京都に",
          projection: DEFAULT_PROJECTION,
          mode: "C",
          subset: { fields: ["surface", "posId"] },
        }),
      ).toEqual(
        withInternalCost(
          [
            createSubsetMorpheme("東京", 0, 6, 7),
            createSubsetMorpheme("都", 6, 9, 8),
            createSubsetMorpheme("に", 9, 12, 9),
          ],
          0,
        ),
      );
      expect(tokenizeSpy).not.toHaveBeenCalled();
      expect(subsetTokenizeSpy).toHaveBeenCalledTimes(1);
      expect(subsetTokenizeSpy).toHaveBeenCalledWith(
        1 as never,
        "東京都に",
        2,
        0,
        (1 << 0) | (1 << 2),
        expect.any(BigUint64Array),
      );
      expect(readSpy).toHaveBeenCalledTimes(1);
      expect(freeSpy).toHaveBeenCalledTimes(1);
      expect(freeSpy).toHaveBeenCalledWith(41 as never);
    } finally {
      freeSpy.mockRestore();
      subsetTokenizeSpy.mockRestore();
      tokenizeSpy.mockRestore();
    }
  });
});

test("tokenize with pos uses the subset native symbol and returns the POS string", () => {
  withTokenizer(({ library, tokenizer, readSpy }) => {
    const tokenizeSpy = spyOn(library.symbols, "sudachi_tokenize");
    const subsetTokenizeSpy = spyOn(library.symbols, "sudachi_tokenize_subset");
    const freeSpy = spyOn(library.symbols, "sudachi_free_result");

    try {
      const result = tokenizer.tokenize({
        text: "東京都に",
        projection: DEFAULT_PROJECTION,
        mode: "C",
        subset: { fields: ["pos"] },
      });
      expect(result).toHaveLength(1);
      expect(result[0]?.pos).toBe("名詞,普通名詞,一般,*,*,*");
      expect(tokenizeSpy).not.toHaveBeenCalled();
      expect(subsetTokenizeSpy).toHaveBeenCalledTimes(1);
      expect(subsetTokenizeSpy).toHaveBeenCalledWith(
        1 as never,
        "東京都に",
        2,
        0,
        (1 << 2) | INFO_SUBSET_FFI_POS_TEXT_BIT,
        expect.any(BigUint64Array),
      );
      expect(readSpy).toHaveBeenCalledTimes(1);
      expect(freeSpy).toHaveBeenCalledTimes(1);
      expect(freeSpy).toHaveBeenCalledWith(43 as never);
    } finally {
      freeSpy.mockRestore();
      subsetTokenizeSpy.mockRestore();
      tokenizeSpy.mockRestore();
    }
  });
});

test("tokenize with new subset fields forwards expected bit flags and returns field values", () => {
  withTokenizer(({ library, tokenizer }) => {
    const subsetTokenizeSpy = spyOn(library.symbols, "sudachi_tokenize_subset");

    try {
      const result = tokenizer.tokenize({
        text: "東京都に",
        projection: DEFAULT_PROJECTION,
        mode: "C",
        subset: {
          fields: ["headWordLength", "splitA", "splitB", "wordStructure"],
        },
      });

      expect(subsetTokenizeSpy).toHaveBeenCalledTimes(1);
      expect(subsetTokenizeSpy).toHaveBeenCalledWith(
        1 as never,
        "東京都に",
        2,
        0,
        (1 << 1) | (1 << 6) | (1 << 7) | (1 << 8),
        expect.any(BigUint64Array),
      );
      expect(result[0]?.headWordLength).toBe(2);
      expect(result[0]?.splitA).toEqual(["(0, 1001)", "(0, 1002)"]);
      expect(result[0]?.splitB).toEqual(["(0, 2001)"]);
      expect(result[0]?.wordStructure).toEqual([
        "(0, 3001)",
        "(0, 3002)",
        "(0, 3003)",
      ]);
    } finally {
      subsetTokenizeSpy.mockRestore();
    }
  });
});

test("lookup with fields uses the subset native symbol and returns defaulted omitted fields", () => {
  withTokenizer(({ lookupLibrary, tokenizer, readLookupSpy }) => {
    const lookupSpy = spyOn(lookupLibrary.symbols, "sudachi_lookup");
    const subsetLookupSpy = spyOn(
      lookupLibrary.symbols,
      "sudachi_lookup_subset",
    );
    const freeSpy = spyOn(lookupLibrary.symbols, "sudachi_free_lookup_result");

    try {
      expect(
        tokenizer.lookup({
          surface: "東京",
          projection: DEFAULT_PROJECTION,
          subset: { fields: ["surface"] },
        }),
      ).toEqual([createSubsetLookupEntry("東京", "(0, 5)", 0, false)]);
      expect(lookupSpy).not.toHaveBeenCalled();
      expect(subsetLookupSpy).toHaveBeenCalledTimes(1);
      expect(subsetLookupSpy).toHaveBeenCalledWith(
        1 as never,
        "東京",
        0,
        1 << 0,
        expect.any(BigUint64Array),
      );
      expect(readLookupSpy).toHaveBeenCalledTimes(1);
      expect(freeSpy).toHaveBeenCalledTimes(1);
      expect(freeSpy).toHaveBeenCalledWith(52 as never);
    } finally {
      freeSpy.mockRestore();
      subsetLookupSpy.mockRestore();
      lookupSpy.mockRestore();
    }
  });
});

test("lookup with new subset fields forwards expected bit flags and returns field values", () => {
  withTokenizer(({ lookupLibrary, tokenizer }) => {
    const subsetLookupSpy = spyOn(
      lookupLibrary.symbols,
      "sudachi_lookup_subset",
    );

    try {
      const result = tokenizer.lookup({
        surface: "東京",
        projection: DEFAULT_PROJECTION,
        subset: {
          fields: ["headWordLength", "splitA", "splitB", "wordStructure"],
        },
      });

      expect(subsetLookupSpy).toHaveBeenCalledTimes(1);
      expect(subsetLookupSpy).toHaveBeenCalledWith(
        1 as never,
        "東京",
        0,
        (1 << 1) | (1 << 6) | (1 << 7) | (1 << 8),
        expect.any(BigUint64Array),
      );
      expect(result[0]?.headWordLength).toBe(1);
      expect(result[0]?.splitA).toEqual(["(0, 4001)"]);
      expect(result[0]?.splitB).toEqual(["(0, 5001)", "(0, 5002)"]);
      expect(result[0]?.wordStructure).toEqual(["(0, 6001)"]);
    } finally {
      subsetLookupSpy.mockRestore();
    }
  });
});

test("lookup with pos uses the subset native symbol and returns the POS string", () => {
  withTokenizer(({ lookupLibrary, tokenizer, readLookupSpy }) => {
    const lookupSpy = spyOn(lookupLibrary.symbols, "sudachi_lookup");
    const subsetLookupSpy = spyOn(
      lookupLibrary.symbols,
      "sudachi_lookup_subset",
    );
    const freeSpy = spyOn(lookupLibrary.symbols, "sudachi_free_lookup_result");

    try {
      const result = tokenizer.lookup({
        surface: "東京",
        projection: DEFAULT_PROJECTION,
        subset: { fields: ["pos"] },
      });
      expect(result).toHaveLength(1);
      expect(result[0]?.pos).toBe("名詞,普通名詞,一般,*,*,*");
      expect(lookupSpy).not.toHaveBeenCalled();
      expect(subsetLookupSpy).toHaveBeenCalledTimes(1);
      expect(subsetLookupSpy).toHaveBeenCalledWith(
        1 as never,
        "東京",
        0,
        (1 << 2) | INFO_SUBSET_FFI_POS_TEXT_BIT,
        expect.any(BigUint64Array),
      );
      expect(readLookupSpy).toHaveBeenCalledTimes(1);
      expect(freeSpy).toHaveBeenCalledTimes(1);
      expect(freeSpy).toHaveBeenCalledWith(54 as never);
    } finally {
      freeSpy.mockRestore();
      subsetLookupSpy.mockRestore();
      lookupSpy.mockRestore();
    }
  });
});

test("createPosMatcher compiles native POS matcher ids and filters morphemes and lookup entries", () => {
  withTokenizer(({ library, tokenizer, readPosMatcherSpy }) => {
    const compileSpy = spyOn(library.symbols, "sudachi_compile_pos_matcher");
    const freeSpy = spyOn(library.symbols, "sudachi_free_pos_matcher_result");

    try {
      const matcher = tokenizer.createPosMatcher({
        patterns: [["名詞"], [null, null, null, null, null, "終止形-一般"]],
      });
      expect(matcher).toBeInstanceOf(PosMatcher);
      expect(compileSpy).toHaveBeenCalledTimes(1);
      expect(compileSpy).toHaveBeenCalledWith(
        1 as never,
        JSON.stringify([
          ["名詞", null, null, null, null, null],
          [null, null, null, null, null, "終止形-一般"],
        ]),
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
      expect(matcher.filter(morphemes)).toEqual([
        requireDefined(morphemes[0], "morphemes[0]"),
        requireDefined(morphemes[2], "morphemes[2]"),
      ]);

      const lookupEntries = [
        createLookupEntry("東京", "(0, 5)", 0, false, 1),
        createLookupEntry("都", "(0, 6)", 0, false, 2),
        createLookupEntry("に", "(0, 1)", 0, false, 3),
      ];
      expect(
        matcher.matches(requireDefined(lookupEntries[0], "lookupEntries[0]")),
      ).toBe(true);
      expect(
        matcher.matches(requireDefined(lookupEntries[1], "lookupEntries[1]")),
      ).toBe(false);
      expect(matcher.filter(lookupEntries)).toEqual([
        requireDefined(lookupEntries[0], "lookupEntries[0]"),
        requireDefined(lookupEntries[2], "lookupEntries[2]"),
      ]);
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
      expect(() =>
        tokenizer.createPosMatcher({
          patterns: [["a", "b", "c", "d", "e", "f", "g"]],
        }),
      ).toThrow("POS matcher patterns must have at most 6 items.");
      expect(compileSpy).not.toHaveBeenCalled();
    } finally {
      compileSpy.mockRestore();
    }
  });
});

test("lookup loads the lookup library lazily and reuses its layout", () => {
  withTokenizer(({ tokenizer, lookupLoadSpy, lookupLayoutSpy }) => {
    tokenizer.tokenize({
      text: "東京都に",
      projection: DEFAULT_PROJECTION,
      mode: "C",
    });
    expect(lookupLoadSpy).not.toHaveBeenCalled();
    expect(lookupLayoutSpy).not.toHaveBeenCalled();

    expect(
      tokenizer.lookup({ surface: "東京", projection: DEFAULT_PROJECTION }),
    ).toEqual([
      createLookupEntry("東京", "(0, 5)", 0, false),
      createLookupEntry("東京", "(0, 6)", 0, false),
    ]);
    expect(
      tokenizer.lookup({ surface: "に", projection: DEFAULT_PROJECTION }),
    ).toEqual([createLookupEntry("に", "(0, 1)", 0, false)]);
    expect(lookupLoadSpy).toHaveBeenCalledTimes(1);
    expect(lookupLayoutSpy).toHaveBeenCalledTimes(1);
  });
});

test("split uses the native morpheme resplit symbol and reuses the decoder", () => {
  withTokenizer(({ library, tokenizer, readSpy }) => {
    const splitSpy = spyOn(library.symbols, "sudachi_split_morpheme");
    const freeSpy = spyOn(library.symbols, "sudachi_free_result");
    const morphemes = tokenizer.tokenize({
      text: "東京都に",
      projection: DEFAULT_PROJECTION,
      mode: "C",
    });

    try {
      expect(
        tokenizer.split({
          morpheme: requireDefined(morphemes[0], "morphemes[0]"),
          projection: DEFAULT_PROJECTION,
          mode: "A",
        }),
      ).toEqual(
        withInternalCost(
          [createMorpheme("東京", 0, 6), createMorpheme("都", 6, 9)],
          0,
        ),
      );
      expect(splitSpy).toHaveBeenCalledTimes(1);
      expect(splitSpy).toHaveBeenCalledWith(
        1 as never,
        "東京都に",
        2,
        0,
        0,
        0,
        expect.any(BigUint64Array),
      );
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
    const morphemes = tokenizer.tokenize({
      text: "東京都に",
      projection: DEFAULT_PROJECTION,
      mode: "C",
    });

    try {
      expect(
        tokenizer.splitInto({
          morphemes,
          projection: DEFAULT_PROJECTION,
          mode: "A",
        }),
      ).toEqual(
        withInternalCost(
          [
            createMorpheme("東京", 0, 6),
            createMorpheme("都", 6, 9),
            createMorpheme("に", 9, 12),
          ],
          0,
        ),
      );
      expect(listSplitSpy).toHaveBeenCalledTimes(1);
      expect(listSplitSpy).toHaveBeenCalledWith(
        1 as never,
        "東京都に",
        2,
        0,
        0,
        expect.any(BigUint64Array),
      );
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
    const morphemes = tokenizer.tokenize({
      text: "東京都に",
      projection: DEFAULT_PROJECTION,
      mode: "C",
    });
    const splitResult = tokenizer.split({
      morpheme: requireDefined(morphemes[0], "morphemes[0]"),
      projection: DEFAULT_PROJECTION,
      mode: "A",
    });

    try {
      expect(
        tokenizer.splitInto({
          morphemes: splitResult,
          projection: DEFAULT_PROJECTION,
          mode: "A",
        }),
      ).toEqual(
        withInternalCost(
          [createMorpheme("東京", 0, 6), createMorpheme("都", 6, 9)],
          0,
        ),
      );
      expect(listSplitSpy).not.toHaveBeenCalled();
      expect(singleSplitSpy).toHaveBeenCalledTimes(3);
      expect(singleSplitSpy).toHaveBeenNthCalledWith(
        1,
        1 as never,
        "東京都に",
        2,
        0,
        0,
        0,
        expect.any(BigUint64Array),
      );
      expect(singleSplitSpy).toHaveBeenNthCalledWith(
        2,
        1 as never,
        "東京都に",
        0,
        0,
        0,
        0,
        expect.any(BigUint64Array),
      );
      expect(singleSplitSpy).toHaveBeenNthCalledWith(
        3,
        1 as never,
        "東京都に",
        0,
        0,
        1,
        0,
        expect.any(BigUint64Array),
      );
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
    const morphemes = tokenizer.tokenize({
      text: "東京都に",
      projection: DEFAULT_PROJECTION,
      mode: "C",
    });
    morphemes.pop();

    try {
      expect(
        tokenizer.splitInto({
          morphemes,
          projection: DEFAULT_PROJECTION,
          mode: "A",
        }),
      ).toEqual(
        withInternalCost(
          [createMorpheme("東京", 0, 6), createMorpheme("都", 6, 9)],
          0,
        ),
      );
      expect(listSplitSpy).not.toHaveBeenCalled();
      expect(singleSplitSpy).toHaveBeenCalledTimes(1);
      expect(singleSplitSpy).toHaveBeenCalledWith(
        1 as never,
        "東京都に",
        2,
        0,
        0,
        0,
        expect.any(BigUint64Array),
      );
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
    const morphemes = tokenizer.tokenize({
      text: "東京都に",
      projection: DEFAULT_PROJECTION,
      mode: "C",
    });
    const copied = [...morphemes];

    try {
      expect(
        tokenizer.splitInto({
          morphemes: copied,
          projection: DEFAULT_PROJECTION,
          mode: "A",
        }),
      ).toEqual(
        withInternalCost(
          [
            createMorpheme("東京", 0, 6),
            createMorpheme("都", 6, 9),
            createMorpheme("に", 9, 12),
          ],
          0,
        ),
      );
      expect(listSplitSpy).not.toHaveBeenCalled();
      expect(singleSplitSpy).toHaveBeenCalledTimes(2);
      expect(singleSplitSpy).toHaveBeenNthCalledWith(
        1,
        1 as never,
        "東京都に",
        2,
        0,
        0,
        0,
        expect.any(BigUint64Array),
      );
      expect(singleSplitSpy).toHaveBeenNthCalledWith(
        2,
        1 as never,
        "東京都に",
        2,
        0,
        1,
        0,
        expect.any(BigUint64Array),
      );
    } finally {
      singleSplitSpy.mockRestore();
      listSplitSpy.mockRestore();
    }
  });
});

test("splitInto fallback resolves copied morphemes even when projection changes", () => {
  withTokenizer(({ library, tokenizer }) => {
    const listSplitSpy = spyOn(library.symbols, "sudachi_split_morphemes");
    const singleSplitSpy = spyOn(library.symbols, "sudachi_split_morpheme");
    const morphemes = tokenizer.tokenize({
      text: "東京都に",
      projection: DEFAULT_PROJECTION,
      mode: "C",
    });
    const copied = [...morphemes];

    try {
      expect(
        tokenizer.splitInto({
          morphemes: copied,
          projection: "reading",
          mode: "A",
        }),
      ).toEqual(
        withInternalCost(
          [
            createMorpheme("東京", 0, 6),
            createMorpheme("都", 6, 9),
            createMorpheme("に", 9, 12),
          ],
          0,
        ),
      );
      expect(listSplitSpy).not.toHaveBeenCalled();
      expect(singleSplitSpy).toHaveBeenCalledTimes(2);
      expect(singleSplitSpy).toHaveBeenNthCalledWith(
        1,
        1 as never,
        "東京都に",
        2,
        3,
        0,
        0,
        expect.any(BigUint64Array),
      );
      expect(singleSplitSpy).toHaveBeenNthCalledWith(
        2,
        1 as never,
        "東京都に",
        2,
        3,
        1,
        0,
        expect.any(BigUint64Array),
      );
    } finally {
      singleSplitSpy.mockRestore();
      listSplitSpy.mockRestore();
    }
  });
});

test("split rejects morphemes that were not created by the tokenizer", () => {
  withTokenizer(({ tokenizer }) => {
    expect(() =>
      tokenizer.split({
        morpheme: createMorpheme("東京都", 0, 9),
        projection: DEFAULT_PROJECTION,
        mode: "A",
      }),
    ).toThrow("Morpheme was not created by this tokenizer.");
  });
});

test("stateful tokenizer tokenizes with persisted mode and subset", () => {
  withTokenizer(({ library, tokenizer }) => {
    const createSpy = spyOn(
      library.symbols,
      "sudachi_create_stateful_tokenizer_from_tokenizer",
    );
    const resetSpy = spyOn(library.symbols, "sudachi_stateful_tokenizer_reset");
    const setModeSpy = spyOn(
      library.symbols,
      "sudachi_stateful_tokenizer_set_mode",
    );
    const setSubsetSpy = spyOn(
      library.symbols,
      "sudachi_stateful_tokenizer_set_subset",
    );
    const doTokenizeSpy = spyOn(
      library.symbols,
      "sudachi_stateful_tokenizer_do_tokenize",
    );
    const tokenizeSpy = spyOn(library.symbols, "sudachi_tokenize");
    const subsetTokenizeSpy = spyOn(library.symbols, "sudachi_tokenize_subset");

    try {
      const stateful = tokenizer
        .createStatefulTokenizer()
        .reset("東京都に")
        .setMode("A");
      expect(stateful.doTokenize({ projection: DEFAULT_PROJECTION })).toEqual(
        withInternalCost(
          [
            createMorpheme("東京", 0, 6),
            createMorpheme("都", 6, 9),
            createMorpheme("に", 9, 12),
          ],
          0,
        ),
      );
      expect(createSpy).toHaveBeenCalledTimes(1);
      expect(Number(createSpy.mock.calls[0]?.[0] ?? 0)).toBe(1);
      expect(createSpy.mock.calls[0]?.[1]).toBeInstanceOf(BigUint64Array);
      expect(resetSpy).toHaveBeenNthCalledWith(1, 101 as never, "");
      expect(resetSpy).toHaveBeenNthCalledWith(2, 101 as never, "東京都に");
      expect(setModeSpy).toHaveBeenCalledWith(101 as never, 0);

      stateful.setMode("C").setSubset({ fields: ["surface", "posId"] });
      expect(stateful.tokenize({ projection: DEFAULT_PROJECTION })).toEqual(
        withInternalCost(
          [
            createSubsetMorpheme("東京", 0, 6, 7),
            createSubsetMorpheme("都", 6, 9, 8),
            createSubsetMorpheme("に", 9, 12, 9),
          ],
          0,
        ),
      );
      expect(setModeSpy).toHaveBeenLastCalledWith(101 as never, 2);
      expect(setSubsetSpy).toHaveBeenCalledWith(
        101 as never,
        (1 << 0) | (1 << 2),
      );
      expect(doTokenizeSpy).toHaveBeenCalledTimes(2);
      expect(tokenizeSpy).not.toHaveBeenCalled();
      expect(subsetTokenizeSpy).not.toHaveBeenCalled();
    } finally {
      subsetTokenizeSpy.mockRestore();
      tokenizeSpy.mockRestore();
      doTokenizeSpy.mockRestore();
      setSubsetSpy.mockRestore();
      setModeSpy.mockRestore();
      resetSpy.mockRestore();
      createSpy.mockRestore();
    }
  });
});

test("stateful tokenizer forwards expected bits for new subset fields", () => {
  withTokenizer(({ library, tokenizer }) => {
    const setSubsetSpy = spyOn(
      library.symbols,
      "sudachi_stateful_tokenizer_set_subset",
    );

    try {
      tokenizer.createStatefulTokenizer().setSubset({
        fields: ["headWordLength", "splitA", "splitB", "wordStructure"],
      });

      expect(setSubsetSpy).toHaveBeenCalledTimes(1);
      expect(setSubsetSpy).toHaveBeenCalledWith(
        101 as never,
        (1 << 1) | (1 << 6) | (1 << 7) | (1 << 8),
      );
    } finally {
      setSubsetSpy.mockRestore();
    }
  });
});

test("stateful tokenizer closes native stateful handle only", () => {
  withTokenizer(({ library, tokenizer }) => {
    const freeStatefulSpy = spyOn(
      library.symbols,
      "sudachi_free_stateful_tokenizer",
    );
    const freeTokenizerSpy = spyOn(library.symbols, "sudachi_free_tokenizer");

    try {
      const stateful = tokenizer.createStatefulTokenizer({ text: "東京都に" });
      stateful.close();
      expect(freeStatefulSpy).toHaveBeenCalledTimes(1);
      expect(freeStatefulSpy).toHaveBeenCalledWith(101 as never);
      expect(freeTokenizerSpy).not.toHaveBeenCalled();
    } finally {
      freeTokenizerSpy.mockRestore();
      freeStatefulSpy.mockRestore();
    }
  });
});

test("tokenizer close releases tracked stateful tokenizers", () => {
  withTokenizer(({ library, tokenizer }) => {
    const freeStatefulSpy = spyOn(
      library.symbols,
      "sudachi_free_stateful_tokenizer",
    );
    const freeTokenizerSpy = spyOn(library.symbols, "sudachi_free_tokenizer");

    try {
      const stateful = tokenizer.createStatefulTokenizer({ text: "東京都に" });
      tokenizer.close();

      expect(freeStatefulSpy).toHaveBeenCalledTimes(1);
      expect(freeStatefulSpy).toHaveBeenCalledWith(101 as never);
      expect(freeTokenizerSpy).toHaveBeenCalledTimes(1);

      expect(() =>
        stateful.doTokenize({ projection: DEFAULT_PROJECTION }),
      ).toThrow("StatefulTokenizer has been closed.");

      stateful.close();
      expect(freeStatefulSpy).toHaveBeenCalledTimes(1);
    } finally {
      freeTokenizerSpy.mockRestore();
      freeStatefulSpy.mockRestore();
    }
  });
});

test("stateful tokenizer matches one-shot tokenize output", () => {
  withTokenizer(({ tokenizer }) => {
    const stateful = tokenizer.createStatefulTokenizer({
      text: "東京都に",
      mode: "C",
    });
    expect(stateful.doTokenize({ projection: DEFAULT_PROJECTION })).toEqual(
      tokenizer.tokenize({
        text: "東京都に",
        projection: DEFAULT_PROJECTION,
        mode: "C",
      }),
    );
  });
});

test("closing stateful tokenizer does not close tokenizer", () => {
  withTokenizer(({ tokenizer }) => {
    const stateful = tokenizer.createStatefulTokenizer({ text: "東京都に" });
    stateful.close();
    expect(() =>
      stateful.doTokenize({ projection: DEFAULT_PROJECTION }),
    ).toThrow("StatefulTokenizer has been closed.");
    expect(
      tokenizer.tokenize({
        text: "東京都に",
        projection: DEFAULT_PROJECTION,
        mode: "C",
      }),
    ).toEqual(
      withInternalCost(
        [createMorpheme("東京都", 0, 9), createMorpheme("に", 9, 12)],
        0,
      ),
    );
  });
});

test("stateful tokenizer throws INTERNAL when native create returns null handle", () => {
  withTokenizer(({ library, tokenizer }) => {
    const createSpy = spyOn(
      library.symbols,
      "sudachi_create_stateful_tokenizer_from_tokenizer",
    ).mockImplementation((_tokenizerHandle, outHandle) => {
      (outHandle as BigUint64Array)[0] = 0n;
      return 0;
    });

    try {
      let captured: unknown;
      try {
        tokenizer.createStatefulTokenizer();
      } catch (error) {
        captured = error;
      }

      expect(captured).toBeInstanceOf(SudachiError);
      const sudachiError = captured as SudachiError;
      expect(sudachiError.code).toBe("INTERNAL");
      expect(sudachiError.nativeStatus).toBe(255);
      expect(sudachiError.message).toContain("null native handle");
    } finally {
      createSpy.mockRestore();
    }
  });
});

test("createTokenizer closes the native library when initialization fails", () => {
  const library = createMockLibrary();
  const loadSpy = spyOn(native, "loadNativeLibrary").mockReturnValue(library);
  const layoutSpy = spyOn(native, "readMorphemeResultLayout").mockReturnValue(
    MORPHEME_LAYOUT,
  );
  const createSpy = spyOn(
    library.symbols,
    "sudachi_create_tokenizer",
  ).mockReturnValue(7);
  const closeSpy = spyOn(library, "close");

  try {
    expect(() => createTokenizer({ dictPath: "/tmp/dict" })).toThrow(
      "native error",
    );
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledTimes(1);
  } finally {
    closeSpy.mockRestore();
    createSpy.mockRestore();
    layoutSpy.mockRestore();
    loadSpy.mockRestore();
  }
});
