import { expect, test } from "bun:test";

import * as native from "./index.ts";

function createNativeErrorSymbols(errorText = "native error") {
  return {
    sudachi_get_last_error: () => errorText as unknown as import("bun:ffi").CString,
    sudachi_status_code_name: () => "TOKENIZE" as unknown as import("bun:ffi").CString,
  };
}

test("native barrel exports loader/layout/error entry points", () => {
  expect(typeof native.loadNativeLibrary).toBe("function");
  expect(typeof native.createNativeSudachiLibrary).toBe("function");

  expect(typeof native.readMorphemeResultLayout).toBe("function");
  expect(typeof native.validateArrayLayout).toBe("function");

  expect(typeof native.readNativeError).toBe("function");
  expect(typeof native.createNativeSudachiError).toBe("function");
});

test("createNative*Library functions are callable without real FFI", () => {
  let closeCalls = 0;
  const close = () => {
    closeCalls += 1;
  };

  const tokenizerLibrary = native.createNativeSudachiLibrary(
    {
      sudachi_create_tokenizer: () => 0,
      sudachi_free_tokenizer: () => {},
      sudachi_tokenize: () => 0,
      sudachi_tokenize_subset: () => 0,
      sudachi_split_morpheme: () => 0,
      sudachi_split_morphemes: () => 0,
      sudachi_compile_pos_matcher: () => 0,
      sudachi_free_result: () => {},
      sudachi_free_pos_matcher_result: () => {},
      sudachi_get_morpheme_result_layout: () => 0,
      sudachi_get_pos_matcher_result_layout: () => 0,
      ...createNativeErrorSymbols(),
    },
    close,
  );

  const lookupLibrary = native.createNativeLookupLibrary(
    {
      sudachi_lookup: () => 0,
      sudachi_lookup_subset: () => 0,
      sudachi_free_lookup_result: () => {},
      sudachi_get_lookup_result_layout: () => 0,
      ...createNativeErrorSymbols(),
    },
    close,
  );

  const pretokenizerLibrary = native.createNativePretokenizerLibrary(
    {
      sudachi_create_pretokenizer: () => 0,
      sudachi_set_pretokenizer_debug: () => 0,
      sudachi_free_pretokenizer: () => {},
      sudachi_pretokenize: () => 0,
      sudachi_pretokenize_subset: () => 0,
      sudachi_free_pretokenized_result: () => {},
      sudachi_get_pretokenized_result_layout: () => 0,
      ...createNativeErrorSymbols(),
    },
    close,
  );

  const sentenceSplitterLibrary = native.createNativeSentenceSplitterLibrary(
    {
      sudachi_create_sentence_splitter: () => 0,
      sudachi_free_sentence_splitter: () => {},
      sudachi_split_sentences: () => 0,
      sudachi_free_sentence_spans: () => {},
      sudachi_get_sentence_span_layout: () => 0,
      ...createNativeErrorSymbols(),
    },
    close,
  );

  expect(typeof tokenizerLibrary.symbols.sudachi_tokenize).toBe("function");
  expect(typeof lookupLibrary.symbols.sudachi_lookup).toBe("function");
  expect(typeof pretokenizerLibrary.symbols.sudachi_pretokenize).toBe("function");
  expect(typeof sentenceSplitterLibrary.symbols.sudachi_split_sentences).toBe("function");

  tokenizerLibrary.close();
  lookupLibrary.close();
  pretokenizerLibrary.close();
  sentenceSplitterLibrary.close();
  expect(closeCalls).toBe(4);
});

test("layout and error helpers are callable from native barrel", () => {
  expect(() => native.validateArrayLayout(1, 1, 8, 0, "test layout")).not.toThrow();

  const errorLibrary = {
    symbols: {
      ...createNativeErrorSymbols("ffi message"),
      sudachi_lookup: () => 0,
      sudachi_lookup_subset: () => 0,
      sudachi_free_lookup_result: () => {},
      sudachi_get_lookup_result_layout: () => 0,
    },
    close: () => {},
  };

  expect(native.readNativeError(errorLibrary)).toBe("ffi message");

  const error = native.createNativeSudachiError(errorLibrary, 5, "fallback");
  expect(error.message).toBe("ffi message");
  expect(error.nativeStatus).toBe(5);
});
