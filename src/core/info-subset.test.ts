import { expect, test } from "bun:test";

import { type InfoSubsetField, SudachiError } from "../types.ts";
import {
  ALL_INFO_SUBSET_BITS,
  INFO_SUBSET_FFI_POS_TEXT_BIT,
  INFO_SUBSET_FIELD_BITS,
  resolveInfoSubsetBits,
} from "./info-subset.ts";

test("resolveInfoSubsetBits returns null when subset options are omitted", () => {
  expect(resolveInfoSubsetBits(undefined)).toBeNull();
});

test("resolveInfoSubsetBits returns full bitmask when fields are omitted", () => {
  expect(resolveInfoSubsetBits({})).toBe(ALL_INFO_SUBSET_BITS);
});

test("resolveInfoSubsetBits combines requested field bits", () => {
  expect(resolveInfoSubsetBits({ fields: ["surface", "posId"] })).toBe(
    INFO_SUBSET_FIELD_BITS.surface | INFO_SUBSET_FIELD_BITS.posId,
  );
});

test("resolveInfoSubsetBits uses POS text bit for pos field", () => {
  const bits = resolveInfoSubsetBits({ fields: ["pos"] });
  expect(bits).toBe(INFO_SUBSET_FIELD_BITS.pos);
  expect((bits ?? 0) & INFO_SUBSET_FFI_POS_TEXT_BIT).toBe(
    INFO_SUBSET_FFI_POS_TEXT_BIT,
  );
});

test("resolveInfoSubsetBits keeps unsupported field error style", () => {
  expect(() =>
    resolveInfoSubsetBits({
      fields: ["not-supported" as unknown as InfoSubsetField],
    }),
  ).toThrow("Unsupported info subset field: not-supported.");

  try {
    resolveInfoSubsetBits({
      fields: ["not-supported" as unknown as InfoSubsetField],
    });
  } catch (error) {
    expect(error).toBeInstanceOf(SudachiError);
    expect((error as SudachiError).code).toBe("INVALID_ARGUMENT");
  }
});
