import { expect, test } from "bun:test";
import { readNativeStatusCodeName } from "./native/error/mapper.ts";
import type {
  NativeLookupLibrary,
  NativePretokenizerLibrary,
  NativeSudachiLibrary,
} from "./native/types.ts";
import {
  LOOKUP_RESULT_LAYOUT_VERSION,
  MORPHEME_RESULT_LAYOUT_VERSION,
  POS_MATCHER_RESULT_LAYOUT_VERSION,
  PRETOKENIZED_RESULT_LAYOUT_VERSION,
  readLookupResultLayout,
  readMorphemeResultLayout,
  readPosMatcherResultLayout,
  readPretokenizedResultLayout,
} from "./native.ts";

function createLibrary(
  layoutWriter: (outLayout: BigUint64Array) => number = (outLayout) => {
    const values = [
      BigInt(MORPHEME_RESULT_LAYOUT_VERSION),
      0n,
      8n,
      16n,
      96n,
      0n,
      8n,
      16n,
      24n,
      32n,
      40n,
      48n,
      56n,
      64n,
      68n,
      72n,
      80n,
      88n,
    ];

    values.forEach((value, index) => {
      outLayout[index] = value;
    });

    return 0;
  },
  posMatcherLayoutWriter: (outLayout: BigUint64Array) => number = layoutWriter,
): NativeSudachiLibrary {
  return {
    symbols: {
      sudachi_create_tokenizer: () => 0,
      sudachi_free_tokenizer: () => {},
      sudachi_create_stateful_tokenizer_from_tokenizer: () => 0,
      sudachi_free_stateful_tokenizer: () => {},
      sudachi_stateful_tokenizer_reset: () => 0,
      sudachi_stateful_tokenizer_set_mode: () => 0,
      sudachi_stateful_tokenizer_set_subset: () => 0,
      sudachi_stateful_tokenizer_do_tokenize: () => 0,
      sudachi_tokenize: () => 0,
      sudachi_tokenize_subset: () => 0,
      sudachi_split_morpheme: () => 0,
      sudachi_split_morphemes: () => 0,
      sudachi_compile_pos_matcher: () => 0,
      sudachi_free_result: () => {},
      sudachi_free_pos_matcher_result: () => {},
      sudachi_get_morpheme_result_layout: (outLayout) =>
        layoutWriter(outLayout as BigUint64Array),
      sudachi_get_pos_matcher_result_layout: (outLayout) =>
        posMatcherLayoutWriter(outLayout as BigUint64Array),
      sudachi_get_last_error: () =>
        "native error" as unknown as import("bun:ffi").CString,
      sudachi_status_code_name: (status) =>
        (status === 5
          ? "TOKENIZE"
          : status === 10
            ? "PRETOKENIZE"
            : "UNKNOWN") as unknown as import("bun:ffi").CString,
    },
    close: () => {},
  };
}

function createLookupLibrary(
  layoutWriter: (outLayout: BigUint64Array) => number = (outLayout) => {
    const values = [
      BigInt(LOOKUP_RESULT_LAYOUT_VERSION),
      0n,
      8n,
      16n,
      40n,
      0n,
      8n,
      16n,
      24n,
      28n,
      32n,
    ];

    values.forEach((value, index) => {
      outLayout[index] = value;
    });

    return 0;
  },
): NativeLookupLibrary {
  return {
    symbols: {
      sudachi_lookup: () => 0,
      sudachi_lookup_subset: () => 0,
      sudachi_free_lookup_result: () => {},
      sudachi_get_lookup_result_layout: (outLayout) =>
        layoutWriter(outLayout as BigUint64Array),
      sudachi_get_last_error: () =>
        "native error" as unknown as import("bun:ffi").CString,
      sudachi_status_code_name: (status) =>
        (status === 9
          ? "LOOKUP"
          : "UNKNOWN") as unknown as import("bun:ffi").CString,
    },
    close: () => {},
  };
}

function createPosMatcherLibrary(
  layoutWriter: (outLayout: BigUint64Array) => number = (outLayout) => {
    const values = [BigInt(POS_MATCHER_RESULT_LAYOUT_VERSION), 0n, 8n, 16n, 2n];

    values.forEach((value, index) => {
      outLayout[index] = value;
    });

    return 0;
  },
): NativeSudachiLibrary {
  return createLibrary(undefined, layoutWriter);
}

function createPretokenizerLibrary(
  layoutWriter: (outLayout: BigUint64Array) => number = (outLayout) => {
    const values = [
      BigInt(PRETOKENIZED_RESULT_LAYOUT_VERSION),
      0n,
      8n,
      16n,
      128n,
      0n,
      8n,
      16n,
      24n,
      32n,
      40n,
      48n,
      56n,
      64n,
      72n,
      80n,
      84n,
      88n,
      96n,
      104n,
    ];

    values.forEach((value, index) => {
      outLayout[index] = value;
    });

    return 0;
  },
): NativePretokenizerLibrary {
  return {
    symbols: {
      sudachi_create_pretokenizer: () => 0,
      sudachi_free_pretokenizer: () => {},
      sudachi_pretokenize: () => 0,
      sudachi_pretokenize_subset: () => 0,
      sudachi_free_pretokenized_result: () => {},
      sudachi_get_pretokenized_result_layout: (outLayout) =>
        layoutWriter(outLayout as BigUint64Array),
      sudachi_get_last_error: () =>
        "native error" as unknown as import("bun:ffi").CString,
      sudachi_status_code_name: (status) =>
        (status === 10
          ? "PRETOKENIZE"
          : "UNKNOWN") as unknown as import("bun:ffi").CString,
    },
    close: () => {},
  };
}

test("readMorphemeResultLayout maps the Rust layout buffer in order", () => {
  expect(readMorphemeResultLayout(createLibrary())).toEqual({
    layoutVersion: MORPHEME_RESULT_LAYOUT_VERSION,
    arrayLayoutKind: 0,
    arrayItemsOffset: 8,
    arrayLenOffset: 16,
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
  });
});

test("readMorphemeResultLayout rejects unsupported layout versions", () => {
  expect(() =>
    readMorphemeResultLayout(
      createLibrary((outLayout) => {
        outLayout[0] = 999n;
        return 0;
      }),
    ),
  ).toThrow("Unsupported morpheme result layout version");
});

test("readMorphemeResultLayout rejects unsupported array layout kinds", () => {
  expect(() =>
    readMorphemeResultLayout(
      createLibrary((outLayout) => {
        const values = [
          BigInt(MORPHEME_RESULT_LAYOUT_VERSION),
          2n,
          8n,
          16n,
          96n,
          0n,
          8n,
          16n,
          24n,
          32n,
          40n,
          48n,
          56n,
          64n,
          68n,
          72n,
          80n,
          88n,
        ];
        values.forEach((value, index) => {
          outLayout[index] = value;
        });
        return 0;
      }),
    ),
  ).toThrow("Unsupported morpheme result layout array layout kind");
});

test("readNativeStatusCodeName uses the Rust-provided code names", () => {
  expect(readNativeStatusCodeName(createLibrary(), 5)).toBe("TOKENIZE");
  expect(readNativeStatusCodeName(createLibrary(), 10)).toBe("PRETOKENIZE");
});

test("readNativeStatusCodeName accepts the PRETOKENIZER alias", () => {
  const library: NativePretokenizerLibrary = {
    symbols: {
      sudachi_create_pretokenizer: () => 0,
      sudachi_free_pretokenizer: () => {},
      sudachi_pretokenize: () => 0,
      sudachi_pretokenize_subset: () => 0,
      sudachi_free_pretokenized_result: () => {},
      sudachi_get_pretokenized_result_layout: () => 0,
      sudachi_get_last_error: () =>
        "native error" as unknown as import("bun:ffi").CString,
      sudachi_status_code_name: (status) =>
        (status === 10
          ? "PRETOKENIZER"
          : "UNKNOWN") as unknown as import("bun:ffi").CString,
    },
    close: () => {},
  };

  expect(readNativeStatusCodeName(library, 10)).toBe("PRETOKENIZER");
});

test("readLookupResultLayout maps the Rust lookup layout buffer in order", () => {
  expect(readLookupResultLayout(createLookupLibrary())).toEqual({
    layoutVersion: LOOKUP_RESULT_LAYOUT_VERSION,
    arrayLayoutKind: 0,
    arrayItemsOffset: 8,
    arrayLenOffset: 16,
    resultSize: 40,
    surfaceOffset: 0,
    posOffset: 8,
    wordIdOffset: 16,
    posIdOffset: 24,
    dictionaryIdOffset: 28,
    isOovOffset: 32,
  });
});

test("readLookupResultLayout rejects unsupported layout versions", () => {
  expect(() =>
    readLookupResultLayout(
      createLookupLibrary((outLayout) => {
        outLayout[0] = 999n;
        return 0;
      }),
    ),
  ).toThrow("Unsupported lookup result layout version");
});

test("readPosMatcherResultLayout maps the Rust POS matcher layout buffer in order", () => {
  expect(readPosMatcherResultLayout(createPosMatcherLibrary())).toEqual({
    layoutVersion: POS_MATCHER_RESULT_LAYOUT_VERSION,
    arrayLayoutKind: 0,
    arrayItemsOffset: 8,
    arrayLenOffset: 16,
    resultSize: 2,
  });
});

test("readPosMatcherResultLayout rejects unsupported layout versions", () => {
  expect(() =>
    readPosMatcherResultLayout(
      createPosMatcherLibrary((outLayout) => {
        outLayout[0] = 999n;
        return 0;
      }),
    ),
  ).toThrow("Unsupported POS matcher result layout version");
});

test("readPretokenizedResultLayout maps the Rust pretokenizer layout buffer in order", () => {
  expect(readPretokenizedResultLayout(createPretokenizerLibrary())).toEqual({
    layoutVersion: PRETOKENIZED_RESULT_LAYOUT_VERSION,
    arrayLayoutKind: 0,
    arrayItemsOffset: 8,
    arrayLenOffset: 16,
    resultSize: 128,
    surfaceOffset: 0,
    normalizedOffset: 8,
    dictionaryFormOffset: 16,
    readingOffset: 24,
    posOffset: 32,
    beginByteOffset: 40,
    endByteOffset: 48,
    beginCharOffset: 56,
    endCharOffset: 64,
    wordIdOffset: 72,
    posIdOffset: 80,
    dictionaryIdOffset: 84,
    isOovOffset: 88,
    synonymGroupIdsOffset: 96,
    synonymGroupIdsLenOffset: 104,
  });
});

test("readPretokenizedResultLayout rejects unsupported layout versions", () => {
  expect(() =>
    readPretokenizedResultLayout(
      createPretokenizerLibrary((outLayout) => {
        outLayout[0] = 999n;
        return 0;
      }),
    ),
  ).toThrow("Unsupported pretokenized result layout version");
});
