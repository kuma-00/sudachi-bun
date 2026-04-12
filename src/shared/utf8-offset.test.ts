import { expect, test } from "bun:test";

import { createUtf8ByteOffsetIndexMap } from "./utf8-offset.ts";

function raise(message: string): never {
  throw new Error(message);
}

test("createUtf8ByteOffsetIndexMap resolves UTF-8 byte boundaries", () => {
  const indexMap = createUtf8ByteOffsetIndexMap("😀。 B？", [0, 7, 12], {
    throwInvalid: raise,
    messages: {
      outOfRange: (offset) => `out-of-range: ${offset}`,
      notBoundary: (offset) => `not-boundary: ${offset}`,
    },
  });

  expect(indexMap.get(0)).toBe(0);
  expect(indexMap.get(7)).toBe(3);
  expect(indexMap.get(12)).toBe(6);
});

test("createUtf8ByteOffsetIndexMap rejects out-of-range offsets", () => {
  expect(() =>
    createUtf8ByteOffsetIndexMap("abc", [4], {
      throwInvalid: raise,
      messages: {
        outOfRange: (offset) => `out-of-range: ${offset}`,
        notBoundary: (offset) => `not-boundary: ${offset}`,
      },
    }),
  ).toThrow("out-of-range: 4");
});

test("createUtf8ByteOffsetIndexMap rejects non-boundary offsets", () => {
  expect(() =>
    createUtf8ByteOffsetIndexMap("😀。", [1], {
      throwInvalid: raise,
      messages: {
        outOfRange: (offset) => `out-of-range: ${offset}`,
        notBoundary: (offset) => `not-boundary: ${offset}`,
      },
    }),
  ).toThrow("not-boundary: 1");
});
