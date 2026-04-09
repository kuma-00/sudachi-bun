import { expect, spyOn, test } from "bun:test";

import { Tokenizer } from "./core.ts";
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

const SAMPLE_MORPHEMES = [
  {
    surface: "すもも",
    normalized: "すもも",
    dictionaryForm: "すもも",
    reading: "スモモ",
    pos: "名詞",
    begin: 0,
    end: 3,
    wordId: "1",
    posId: 1,
    dictionaryId: 0,
    isOov: false,
    synonymGroupIds: [],
  },
  {
    surface: "もも",
    normalized: "もも",
    dictionaryForm: "もも",
    reading: "モモ",
    pos: "名詞",
    begin: 3,
    end: 5,
    wordId: "2",
    posId: 1,
    dictionaryId: 0,
    isOov: false,
    synonymGroupIds: [],
  },
] as const;

function createFakeTokenizer() {
  let lastTokenizeArgs: { text: string; mode: string } | undefined;

  return {
    lastTokenizeArgs: () => lastTokenizeArgs,
    tokenizer: {
      tokenize(text: string, mode: string) {
        lastTokenizeArgs = { text, mode };
        return SAMPLE_MORPHEMES as unknown as ReturnType<Tokenizer["tokenize"]>;
      },
      close() {},
    },
  };
}

test("parseArgValue preserves --output - as the stdout marker", () => {
  expect(parseArgValue(["--output", "-"], "output")).toBe("-");
});

test("parseArgValue treats known boolean flags as flags by default", () => {
  try {
    parseArgValue(["--text", "--wakati"], "text");
    throw new Error("Expected parseArgValue to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(SudachiError);
    expect((error as SudachiError).code).toBe("MISSING_ARGUMENT");
    expect((error as Error).message).toBe("Missing value for --text");
  }
});

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

test("runCli renders wakati output when --wakati is requested", () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);

  try {
    const exitCode = runCli(["--dict-path", "/tmp/dict", "--wakati", "--text", "ignored"], {}, io);

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(logs[0]).toBe("すもも もも");
    expect(fakeTokenizer.lastTokenizeArgs()).toEqual({ text: "ignored", mode: "C" });
    expect(loadSpy).toHaveBeenCalledTimes(1);
  } finally {
    loadSpy.mockRestore();
  }
});

test("runCli rejects --all as an unknown flag", () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);

  try {
    const exitCode = runCli(["--dict-path", "/tmp/dict", "--all", "--text", "ignored"], {}, io);

    expect(exitCode).toBe(1);
    expect(errors[0]).toBe("[INVALID_ARGUMENT] Unknown flag: --all");
    expect(logs[0]).toContain("Usage:");
    expect(loadSpy).not.toHaveBeenCalled();
    expect(fakeTokenizer.lastTokenizeArgs()).toBeUndefined();
  } finally {
    loadSpy.mockRestore();
  }
});

for (const [flag, value] of [["--wakati", "true"]] as const) {
  test(`runCli rejects ${flag}=${value} as invalid boolean flag syntax`, () => {
    const { io, logs, errors } = createCapturedIo();
    const fakeTokenizer = createFakeTokenizer();
    const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);

    try {
      const exitCode = runCli(["--dict-path", "/tmp/dict", `${flag}=${value}`, "--text", "ignored"], {}, io);

      expect(exitCode).toBe(1);
      expect(errors[0]).toBe(`[INVALID_ARGUMENT] Invalid boolean flag syntax: ${flag}=${value}`);
      expect(logs[0]).toContain("Usage:");
      expect(loadSpy).not.toHaveBeenCalled();
      expect(fakeTokenizer.lastTokenizeArgs()).toBeUndefined();
    } finally {
      loadSpy.mockRestore();
    }
  });
}

for (const [flag, value] of [["--wakati", "false"]] as const) {
  test(`runCli rejects ${flag} ${value} as invalid boolean flag syntax`, () => {
    const { io, logs, errors } = createCapturedIo();
    const fakeTokenizer = createFakeTokenizer();
    const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);

    try {
      const exitCode = runCli(["--dict-path", "/tmp/dict", flag, value, "--text", "ignored"], {}, io);

      expect(exitCode).toBe(1);
      expect(errors[0]).toBe(`[INVALID_ARGUMENT] Invalid boolean flag syntax: ${flag} ${value}`);
      expect(logs[0]).toContain("Usage:");
      expect(loadSpy).not.toHaveBeenCalled();
      expect(fakeTokenizer.lastTokenizeArgs()).toBeUndefined();
    } finally {
      loadSpy.mockRestore();
    }
  });
}

test("runCli treats --output - as stdout", () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);

  try {
    const exitCode = runCli(["--dict-path", "/tmp/dict", "--wakati", "--output", "-", "--text", "ignored"], {}, io);

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(logs[0]).toBe("すもも もも");
    expect(fakeTokenizer.lastTokenizeArgs()).toEqual({ text: "ignored", mode: "C" });
    expect(loadSpy).toHaveBeenCalledTimes(1);
  } finally {
    loadSpy.mockRestore();
  }
});

test("runCli reports a coded error when output file writing fails", () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);
  const missingDir = `/tmp/sudachi-bun-missing-${crypto.randomUUID()}`;
  const outputPath = `${missingDir}/tokens.json`;

  try {
    const exitCode = runCli(["--dict-path", "/tmp/dict", "--wakati", "--output", outputPath, "--text", "ignored"], {}, io);

    expect(exitCode).toBe(1);
    expect(errors[0]).toContain("[");
    expect(errors[0]).toMatch(/no such file or directory|permission denied/i);
    expect(logs[0]).toContain("Usage:");
    expect(fakeTokenizer.lastTokenizeArgs()).toEqual({ text: "ignored", mode: "C" });
    expect(loadSpy).toHaveBeenCalledTimes(1);
  } finally {
    loadSpy.mockRestore();
  }
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
