import { expect, test } from "bun:test";

import {
  formatSudachiError,
  parseTokenizeMode,
  SudachiError,
} from "./types.ts";

test("parseTokenizeMode returns the provided mode when valid", () => {
  expect(parseTokenizeMode("B")).toBe("B");
});

test("parseTokenizeMode throws a coded SudachiError when invalid", () => {
  try {
    parseTokenizeMode("Z");
    throw new Error("Expected parseTokenizeMode to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(SudachiError);
    expect((error as SudachiError).code).toBe("INVALID_MODE");
    expect((error as Error).message).toBe("Invalid mode: Z");
  }
});

test("formatSudachiError prefixes the code for SudachiError", () => {
  const error = new SudachiError("Tokenizer closed.", {
    code: "TOKENIZER_CLOSED",
  });

  expect(formatSudachiError(error)).toBe(
    "[TOKENIZER_CLOSED] Tokenizer closed.",
  );
});
