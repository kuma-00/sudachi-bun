import { expect, spyOn, test } from "bun:test";
import type {
  LookupResultLayout,
  MorphemeResultLayout,
  NativeLookupLibrary,
  NativeSudachiLibrary,
  PosMatcherResultLayout,
} from "../native/types.ts";
import * as native from "../native.ts";
import type { TokenizerOptions } from "../types.ts";
import { TokenizerSessionManager } from "./session.ts";
import * as gatewayModule from "./tokenizer-gateway.ts";

const MORPHEME_LAYOUT: MorphemeResultLayout = {
  layoutVersion: 1,
  arrayLayoutKind: 0,
  arrayItemsOffset: 0,
  arrayLenOffset: 8,
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
};

const POS_MATCHER_LAYOUT: PosMatcherResultLayout = {
  layoutVersion: 1,
  arrayLayoutKind: 0,
  arrayItemsOffset: 0,
  arrayLenOffset: 8,
  resultSize: 2,
};

const OPTIONS: TokenizerOptions = {
  dictPath: "dict/system.dic",
};

function createMockTokenizerLibrary(): NativeSudachiLibrary {
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
      sudachi_lookup: () => 0,
      sudachi_lookup_subset: () => 0,
      sudachi_free_lookup_result: () => {},
      sudachi_get_lookup_result_layout: () => 0,
      sudachi_get_last_error: () => "native error" as never,
      sudachi_status_code_name: () => "UNKNOWN" as never,
    },
    close: () => {},
  };
}

test("TokenizerSessionManager closes once and exposes closed state", () => {
  const library = createMockTokenizerLibrary();
  const loadSpy = spyOn(native, "loadNativeLibrary").mockReturnValue(library);
  const layoutSpy = spyOn(native, "readMorphemeResultLayout").mockReturnValue(
    MORPHEME_LAYOUT,
  );
  const freeSpy = spyOn(library.symbols, "sudachi_free_tokenizer");
  const closeSpy = spyOn(library, "close");

  const session = new TokenizerSessionManager(OPTIONS);

  expect(loadSpy).toHaveBeenCalledTimes(1);
  expect(layoutSpy).toHaveBeenCalledTimes(1);
  expect(session.closed).toBeFalse();

  session.close();
  expect(session.closed).toBeTrue();
  expect(freeSpy).toHaveBeenCalledTimes(1);
  expect(closeSpy).toHaveBeenCalledTimes(1);

  session.close();
  expect(freeSpy).toHaveBeenCalledTimes(1);
  expect(closeSpy).toHaveBeenCalledTimes(1);

  expect(() => session.getOpenSession()).toThrow("Tokenizer has been closed.");
});

test("TokenizerSessionManager lazy-loads lookup library and reuses it", () => {
  const library = createMockTokenizerLibrary();
  const lookupLibrary = createMockLookupLibrary();
  spyOn(native, "loadNativeLibrary").mockReturnValue(library);
  spyOn(native, "readMorphemeResultLayout").mockReturnValue(MORPHEME_LAYOUT);
  const loadLookupSpy = spyOn(native, "loadLookupLibrary").mockReturnValue(
    lookupLibrary,
  );
  const readLookupLayoutSpy = spyOn(
    native,
    "readLookupResultLayout",
  ).mockReturnValue(LOOKUP_LAYOUT);
  const lookupCloseSpy = spyOn(lookupLibrary, "close");

  const session = new TokenizerSessionManager(OPTIONS);

  expect(loadLookupSpy).toHaveBeenCalledTimes(0);
  expect(readLookupLayoutSpy).toHaveBeenCalledTimes(0);

  const first = session.getLookupSession();
  expect(loadLookupSpy).toHaveBeenCalledTimes(1);
  expect(readLookupLayoutSpy).toHaveBeenCalledTimes(1);

  const second = session.getLookupSession();
  expect(loadLookupSpy).toHaveBeenCalledTimes(1);
  expect(readLookupLayoutSpy).toHaveBeenCalledTimes(1);
  expect(second.library).toBe(first.library);
  expect(second.layout).toBe(first.layout);

  session.close();
  expect(lookupCloseSpy).toHaveBeenCalledTimes(1);
});

test("TokenizerSessionManager memoizes gateway instance", () => {
  const library = createMockTokenizerLibrary();
  spyOn(native, "loadNativeLibrary").mockReturnValue(library);
  spyOn(native, "readMorphemeResultLayout").mockReturnValue(MORPHEME_LAYOUT);
  spyOn(native, "readPosMatcherResultLayout").mockReturnValue(
    POS_MATCHER_LAYOUT,
  );

  const gateway = {
    tokenize: () => [],
    lookup: () => [],
    compilePosMatcher: () => [],
    splitMorpheme: () => [],
    splitMorphemes: () => [],
  };
  const gatewayFactorySpy = spyOn(
    gatewayModule,
    "createTokenizerGateway",
  ).mockReturnValue(gateway);

  const session = new TokenizerSessionManager(OPTIONS);
  const first = session.getGateway();
  const second = session.getGateway();

  expect(first).toBe(gateway);
  expect(second).toBe(gateway);
  expect(gatewayFactorySpy).toHaveBeenCalledTimes(1);

  session.close();
  expect(() => session.getGateway()).toThrow("Tokenizer has been closed.");
});
