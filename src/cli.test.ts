import { expect, test } from "bun:test";

import { parseArgValue, parseCliArgs, runCli } from "./cli.ts";
import { SudachiError } from "./types.ts";

test("parseArgValue rejects missing value when next token is another flag", () => {
  try {
    parseArgValue(["--dict-path", "--mode", "C"], "dict-path");
    throw new Error("Expected parseArgValue to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(SudachiError);
    expect((error as SudachiError).code).toBe("MISSING_ARGUMENT");
    expect((error as Error).message).toBe("Missing value for --dict-path");
  }
});

test("parseArgValue rejects missing value when next token is an inline known flag", () => {
  try {
    parseArgValue(["--dict-path", "--mode=C"], "dict-path");
    throw new Error("Expected parseArgValue to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(SudachiError);
    expect((error as SudachiError).code).toBe("MISSING_ARGUMENT");
    expect((error as Error).message).toBe("Missing value for --dict-path");
  }
});

test("parseArgValue accepts values that start with -- when they are not known flags", () => {
  expect(parseArgValue(["--text", "--literal-value"], "text")).toBe("--literal-value");
});

test("parseArgValue accepts inline values", () => {
  expect(parseArgValue(["--dict-path=/tmp/dict"], "dict-path")).toBe("/tmp/dict");
});

test("parseCliArgs resolves defaults from the environment", () => {
  expect(
    parseCliArgs([], {
      SUDACHI_DICT_PATH: "/tmp/dict",
      SUDACHI_CONFIG_PATH: "/tmp/config.json",
      SUDACHI_FFI_PATH: "/tmp/libsudachi_ffi.dylib",
    }),
  ).toEqual({
    dictPath: "/tmp/dict",
    configPath: "/tmp/config.json",
    libraryPath: "/tmp/libsudachi_ffi.dylib",
    mode: "C",
    text: "すもももももももものうち",
  });
});

test("runCli prints a coded error when mode is invalid", () => {
  const logs: string[] = [];
  const errors: string[] = [];

  const exitCode = runCli(
    ["--dict-path", "/tmp/dict", "--mode", "Z"],
    {},
    {
      log: (message) => logs.push(message),
      error: (message) => errors.push(message),
    },
  );

  expect(exitCode).toBe(1);
  expect(errors[0]).toBe("[INVALID_MODE] Invalid mode: Z");
  expect(logs[0]).toContain("Usage:");
});

test("runCli prints a coded error when a required argument is missing", () => {
  const logs: string[] = [];
  const errors: string[] = [];

  const exitCode = runCli(
    ["--dict-path", "--mode=C"],
    {},
    {
      log: (message) => logs.push(message),
      error: (message) => errors.push(message),
    },
  );

  expect(exitCode).toBe(1);
  expect(errors[0]).toBe("[MISSING_ARGUMENT] Missing value for --dict-path");
  expect(logs[0]).toContain("Usage:");
});
