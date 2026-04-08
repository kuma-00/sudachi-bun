import { expect, test } from "bun:test";

import { parseArgValue } from "./cli.ts";

test("parseArgValue rejects missing value when next token is another flag", () => {
  expect(() => parseArgValue(["--dict-path", "--mode", "C"], "dict-path")).toThrow(
    "Missing value for --dict-path",
  );
});

test("parseArgValue accepts values that start with -- when they are not known flags", () => {
  expect(parseArgValue(["--text", "--literal-value"], "text")).toBe("--literal-value");
});

test("parseArgValue accepts inline values", () => {
  expect(parseArgValue(["--dict-path=/tmp/dict"], "dict-path")).toBe("/tmp/dict");
});
