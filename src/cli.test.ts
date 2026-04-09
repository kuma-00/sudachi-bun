import { expect, test } from "bun:test";

import { parseArgValue, parseCliArgs, runCli } from "./cli.ts";
import { SudachiError } from "./types.ts";

function createCapturedIo() {
  const logs: string[] = [];
  const errors: string[] = [];

  return {
    logs,
    errors,
    io: {
      log: (message: string) => logs.push(message),
      error: (message: string) => errors.push(message),
    },
  };
}

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
  const { io, logs, errors } = createCapturedIo();

  const exitCode = runCli(["--dict-path", "--mode=C"], {}, io);

  expect(exitCode).toBe(1);
  expect(errors[0]).toBe("[MISSING_ARGUMENT] Missing value for --dict-path");
  expect(logs[0]).toContain("Usage:");
});

test("runCli rejects an unknown flag before treating the next token as a subcommand", () => {
  const { io, logs, errors } = createCapturedIo();

  const exitCode = runCli(["--dic-path", "/tmp/a"], {}, io);

  expect(exitCode).toBe(1);
  expect(errors[0]).toBe("[INVALID_ARGUMENT] Unknown flag: --dic-path");
  expect(logs[0]).toContain("Usage:");
  expect(logs[0]).toContain("Commands:");
});

test("runCli rejects an unknown flag even when the next token looks like a subcommand", () => {
  const { io, logs, errors } = createCapturedIo();

  const exitCode = runCli(["--unknown", "build", "--dict-path", "/tmp/dic"], {}, io);

  expect(exitCode).toBe(1);
  expect(errors[0]).toBe("[INVALID_ARGUMENT] Unknown flag: --unknown");
  expect(logs[0]).toContain("Usage:");
  expect(logs[0]).toContain("Commands:");
});

for (const command of ["build", "ubuild", "dump"] as const) {
  test(`runCli prints help for ${command}`, () => {
    const { io, logs, errors } = createCapturedIo();

    const exitCode = runCli([command, "--help"], {}, io);

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(logs.join("\n")).toContain("Usage:");
  });
}

test("runCli returns an invalid argument error when build is requested without an implementation", () => {
  const { io, logs, errors } = createCapturedIo();

  const exitCode = runCli(["build"], {}, io);

  expect(exitCode).toBe(1);
  expect(errors[0]).toContain("[INVALID_ARGUMENT]");
  expect(logs[0]).toContain("Usage:");
});
