import { afterEach, expect, spyOn, test } from "bun:test";

import { Pretokenizer, createPretokenizer } from "./pretokenizer.ts";
import * as ffi from "./ffi.ts";
import * as native from "./native.ts";
import * as nativeSession from "./native-session.ts";
import type { NativePretokenizerLibrary, PretokenizedResultLayout } from "./native/types.ts";
import type { PretokenizedToken } from "./types.ts";

const FAKE_LAYOUT: PretokenizedResultLayout = {
  layoutVersion: 1,
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
};

const PRETOKENIZED_TOKEN: PretokenizedToken = {
  surface: "a😀b",
  normalized: "a😀b",
  dictionaryForm: "a😀b",
  reading: "a😀b",
  pos: "名詞",
  beginByte: 0,
  endByte: 6,
  beginChar: 0,
  endChar: 4,
  wordId: "0",
  posId: 1,
  dictionaryId: 0,
  isOov: false,
  synonymGroupIds: [],
};

const activeSpies: Array<{ mockRestore(): void }> = [];

afterEach(() => {
  while (activeSpies.length > 0) {
    activeSpies.pop()?.mockRestore();
  }
});

function trackSpy<T extends { mockRestore(): void }>(spy: T): T {
  activeSpies.push(spy);
  return spy;
}

function createLibrary(): NativePretokenizerLibrary {
  return {
    symbols: {
      sudachi_create_pretokenizer: () => 0,
      sudachi_set_pretokenizer_debug: () => 0,
      sudachi_free_pretokenizer: () => {},
      sudachi_pretokenize: () => 0,
      sudachi_pretokenize_subset: (handle, inputUtf8, mode, projection, subsetBits, outResult) => {
        if (!(outResult instanceof BigUint64Array)) {
          throw new Error("pretokenize subset result buffer missing");
        }
        outResult[0] = 1n;
        return 0;
      },
      sudachi_free_pretokenized_result: () => {},
      sudachi_get_pretokenized_result_layout: () => 0,
      sudachi_get_last_error: () => "native error" as unknown as import("bun:ffi").CString,
      sudachi_status_code_name: (status) =>
        (status === 10 ? "PRETOKENIZE" : "UNKNOWN") as unknown as import("bun:ffi").CString,
    },
    close: () => {},
  };
}

test("pretokenize forwards projection settings and preserves byte/char offsets", () => {
  const library = createLibrary();
  const readSpy = trackSpy(spyOn(ffi, "readPretokenizedArray").mockReturnValue([PRETOKENIZED_TOKEN]));
  const subsetSpy = trackSpy(spyOn(library.symbols, "sudachi_pretokenize_subset"));
  const tokenizeSpy = trackSpy(spyOn(library.symbols, "sudachi_pretokenize"));
  const freeResultSpy = trackSpy(spyOn(library.symbols, "sudachi_free_pretokenized_result"));

  const pretokenizer = new Pretokenizer(
    { library, layout: FAKE_LAYOUT, handle: 1 as never } as never,
    {
      mode: "A",
      projection: "normalized",
      subset: { fields: ["surface", "pos"] },
    },
  );

  expect(pretokenizer.closed).toBe(false);
  expect(pretokenizer.pretokenize("a😀b")).toEqual([PRETOKENIZED_TOKEN]);

  expect(subsetSpy).toHaveBeenCalledTimes(1);
  expect(tokenizeSpy).not.toHaveBeenCalled();
  expect(readSpy).toHaveBeenCalledTimes(1);
  expect(freeResultSpy).toHaveBeenCalledTimes(1);
  expect(readSpy).toHaveBeenCalledWith(1 as never, FAKE_LAYOUT);
  expect(freeResultSpy).toHaveBeenCalledWith(1 as never);

  const call = subsetSpy.mock.calls[0];
  expect(call).toBeDefined();
  if (call) {
    const [handle, inputUtf8, mode, projection, subsetBits, outResult] = call;
    expect(handle).toBe(1 as never);
    expect(inputUtf8).toBe("a😀b");
    expect(typeof mode).toBe("number");
    expect(typeof projection).toBe("number");
    expect(typeof subsetBits).toBe("number");
    expect(outResult).toBeInstanceOf(BigUint64Array);
  }
});

function expectDebugPropagation(debug: boolean): void {
  const library = createLibrary();
  const loadSpy = trackSpy(spyOn(native, "loadPretokenizerLibrary").mockReturnValue(library));
  const openSessionSpy = trackSpy(spyOn(nativeSession, "openNativeHandleSession").mockReturnValue({
    handle: 1 as never,
    layout: FAKE_LAYOUT,
    library,
  }));
  const debugSetterSpy = trackSpy(spyOn(library.symbols, "sudachi_set_pretokenizer_debug"));

  const pretokenizer = createPretokenizer({
    dictPath: "/tmp/dict",
    debug,
  });

  expect(loadSpy).toHaveBeenCalledTimes(1);
  expect(loadSpy).toHaveBeenCalledWith(expect.objectContaining({ debug }));
  expect(openSessionSpy).toHaveBeenCalledTimes(1);
  expect(debugSetterSpy).toHaveBeenCalledTimes(1);
  expect(debugSetterSpy).toHaveBeenCalledWith(1 as never, debug ? 1 : 0);
  pretokenizer.close();
}

test("createPretokenizer forwards debug=true to the native loader", () => {
  expectDebugPropagation(true);
});

test("createPretokenizer forwards debug=false to the native loader", () => {
  expectDebugPropagation(false);
});

test("close releases the pretokenizer handle and closes the library", () => {
  const library = createLibrary();
  const freeTokenizerSpy = trackSpy(spyOn(library.symbols, "sudachi_free_pretokenizer"));
  const closeSpy = trackSpy(spyOn(library, "close"));

  const pretokenizer = new Pretokenizer(
    { library, layout: FAKE_LAYOUT, handle: 1 as never } as never,
    { projection: "surface" },
  );

  expect(pretokenizer.closed).toBe(false);
  pretokenizer.close();
  expect(pretokenizer.closed).toBe(true);
  expect(freeTokenizerSpy).toHaveBeenCalledTimes(1);
  expect(freeTokenizerSpy).toHaveBeenCalledWith(1 as never);
  expect(closeSpy).toHaveBeenCalledTimes(1);
});

test("createPretokenizer closes native resources when default parsing throws", () => {
  const library = createLibrary();
  const freeTokenizerSpy = trackSpy(spyOn(library.symbols, "sudachi_free_pretokenizer"));
  const closeSpy = trackSpy(spyOn(library, "close"));
  const loadSpy = trackSpy(spyOn(native, "loadPretokenizerLibrary").mockReturnValue(library));
  const openSessionSpy = trackSpy(spyOn(nativeSession, "openNativeHandleSession").mockReturnValue({
    handle: 1 as never,
    layout: FAKE_LAYOUT,
    library,
  }));

  expect(() => createPretokenizer({ dictPath: "/tmp/dict", mode: "invalid-mode" as never })).toThrow();

  expect(loadSpy).toHaveBeenCalledTimes(1);
  expect(openSessionSpy).toHaveBeenCalledTimes(1);
  expect(freeTokenizerSpy).toHaveBeenCalledTimes(1);
  expect(freeTokenizerSpy).toHaveBeenCalledWith(1 as never);
  expect(closeSpy).toHaveBeenCalledTimes(1);
});
