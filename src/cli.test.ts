import { expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

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
  const tokenizeCalls: Array<{ text: string; mode: string }> = [];

  return {
    lastTokenizeArgs: () => tokenizeCalls[tokenizeCalls.length - 1],
    tokenizeCalls: () => [...tokenizeCalls],
    tokenizer: {
      tokenize(text: string, mode: string) {
        tokenizeCalls.push({ text, mode });
        return SAMPLE_MORPHEMES as unknown as ReturnType<Tokenizer["tokenize"]>;
      },
      close() {},
    },
  };
}

async function runCliMaybeAsync(
  argv: string[],
  env: NodeJS.ProcessEnv = {},
  io: { log(message: string): void; error(message: string): void } = console,
): Promise<number> {
  return await runCli(argv, env, io);
}

function createTempInputFile(name: string, contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "sudachi-bun-cli-input-"));
  const filePath = join(dir, name);
  fs.writeFileSync(filePath, contents, "utf8");
  return filePath;
}

async function withMockedStdin<T>(stdinText: string, callback: () => Promise<T>): Promise<T> {
  const bunRuntime = Bun as typeof Bun & { stdin: typeof Bun.stdin };
  const originalBunStdin = bunRuntime.stdin;
  const originalIsTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  const originalReadFileSync = fs.readFileSync;
  const readFileSyncSpy = spyOn(fs, "readFileSync").mockImplementation(((path: fs.PathOrFileDescriptor, options?: fs.WriteFileOptions | BufferEncoding | null) => {
    if (path === 0) {
      return stdinText;
    }
    return originalReadFileSync(path, options as BufferEncoding);
  }) as typeof fs.readFileSync);

  try {
    bunRuntime.stdin = { text: async () => stdinText } as typeof Bun.stdin;
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });
    return await callback();
  } finally {
    bunRuntime.stdin = originalBunStdin;
    readFileSyncSpy.mockRestore();

    if (originalIsTTY) {
      Object.defineProperty(process.stdin, "isTTY", originalIsTTY);
    } else {
      delete (process.stdin as { isTTY?: boolean }).isTTY;
    }
  }
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

test("parseArgValue accepts the resource-dir flag", () => {
  expect(parseArgValue(["--resource-dir", "/tmp/resources"], "resource-dir", new Set(["resource-dir"]))).toBe(
    "/tmp/resources",
  );
});

test("parseArgValue accepts the resource_dir alias", () => {
  expect(parseArgValue(["--resource_dir", "/tmp/resources"], "resource_dir", new Set(["resource_dir"]))).toBe(
    "/tmp/resources",
  );
});

test("parseArgValue rejects a missing resource-dir value with a coded error", () => {
  try {
    parseArgValue(["--resource-dir", "--debug"], "resource-dir", new Set(["resource-dir", "debug"]));
    throw new Error("Expected parseArgValue to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(SudachiError);
    expect((error as SudachiError).code).toBe("MISSING_ARGUMENT");
    expect((error as Error).message).toBe("Missing value for --resource-dir");
  }
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

test("parseCliArgs sets splitSentences when --split-sentences is provided", () => {
  expect(parseCliArgs(["--dict-path", "/tmp/dict", "--split-sentences"])).toMatchObject({
    dictPath: "/tmp/dict",
    mode: "C",
    text: "すもももももももものうち",
    splitSentences: true,
  });
});

test("runCli forwards --split-sentences into sentence-aware tokenization", async () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);

  try {
    const exitCode = await runCliMaybeAsync(["--dict-path", "/tmp/dict", "--split-sentences", "--text", "すもも。もも？"], {}, io);

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(fakeTokenizer.tokenizeCalls()).toEqual([
      { text: "すもも。", mode: "C" },
      { text: "もも？", mode: "C" },
    ]);
    expect(JSON.parse(logs[0] ?? "[]")).toHaveLength(4);
  } finally {
    loadSpy.mockRestore();
  }
});

test("runCli keeps whitespace intact when --split-sentences is enabled", async () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);

  try {
    const exitCode = await runCliMaybeAsync(["--dict-path", "/tmp/dict", "--split-sentences", "--text", "A B。 C D？"], {}, io);

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(fakeTokenizer.tokenizeCalls()).toEqual([
      { text: "A B。", mode: "C" },
      { text: " C D？", mode: "C" },
    ]);
    expect(JSON.parse(logs[0] ?? "[]")).toHaveLength(4);
  } finally {
    loadSpy.mockRestore();
  }
});

test("runCli offsets begin/end positions across sentence units when --split-sentences is enabled", async () => {
  const { io, logs, errors } = createCapturedIo();
  const tokenizeCalls: Array<{ text: string; mode: string }> = [];
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(
    () =>
      ({
        tokenize(text: string, mode: string) {
          tokenizeCalls.push({ text, mode });
          return [
            {
              ...SAMPLE_MORPHEMES[0],
              surface: text,
              begin: 0,
              end: Buffer.byteLength(text, "utf8"),
            },
          ] as unknown as ReturnType<Tokenizer["tokenize"]>;
        },
        close() {},
      }) as never,
  );

  try {
    const exitCode = await runCliMaybeAsync(["--dict-path", "/tmp/dict", "--split-sentences", "--text", "A。B？"], {}, io);

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(tokenizeCalls).toEqual([
      { text: "A。", mode: "C" },
      { text: "B？", mode: "C" },
    ]);

    const output = JSON.parse(logs[0] ?? "[]") as Array<{ begin: number; end: number }>;
    expect(output.map(({ begin, end }) => ({ begin, end }))).toEqual([
      { begin: 0, end: 4 },
      { begin: 4, end: 8 },
    ]);
  } finally {
    loadSpy.mockRestore();
  }
});

test("runCli offsets begin/end positions by UTF-8 bytes across sentence units with non-BMP characters", async () => {
  const { io, logs, errors } = createCapturedIo();
  const tokenizeCalls: Array<{ text: string; mode: string }> = [];
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(
    () =>
      ({
        tokenize(text: string, mode: string) {
          tokenizeCalls.push({ text, mode });
          return [
            {
              ...SAMPLE_MORPHEMES[0],
              surface: text,
              begin: 0,
              end: Buffer.byteLength(text, "utf8"),
            },
          ] as unknown as ReturnType<Tokenizer["tokenize"]>;
        },
        close() {},
      }) as never,
  );

  try {
    const exitCode = await runCliMaybeAsync(["--dict-path", "/tmp/dict", "--split-sentences", "--text", "😀。B？"], {}, io);

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(tokenizeCalls).toEqual([
      { text: "😀。", mode: "C" },
      { text: "B？", mode: "C" },
    ]);

    const output = JSON.parse(logs[0] ?? "[]") as Array<{ begin: number; end: number }>;
    expect(output.map(({ begin, end }) => ({ begin, end }))).toEqual([
      { begin: 0, end: 7 },
      { begin: 7, end: 11 },
    ]);
  } finally {
    loadSpy.mockRestore();
  }
});

test("runCli emits debug information on stderr without changing stdout output", async () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);

  try {
    const exitCode = await runCliMaybeAsync(["--dict-path", "/tmp/dict", "--wakati", "--debug", "--text", "ignored"], {}, io);

    expect(exitCode).toBe(0);
    expect(logs[0]).toBe("すもも もも");
    expect(errors.some((message) => message.includes("[debug] tokenize"))).toBeTrue();
    expect(errors.some((message) => message.includes("[debug] morphemes="))).toBeTrue();
  } finally {
    loadSpy.mockRestore();
  }
});

test("runCli accepts --resource-dir and --resource_dir at the CLI level", async () => {
  const resourceDir = mkdtempSync(join(tmpdir(), "sudachi-bun-resource-"));

  for (const flag of ["--resource-dir", "--resource_dir"] as const) {
    const { io, logs, errors } = createCapturedIo();
    const fakeTokenizer = createFakeTokenizer();
    const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);

    try {
      const exitCode = await runCliMaybeAsync(["--dict-path", "/tmp/dict", flag, resourceDir, "--text", "ignored"], {}, io);

      expect(exitCode).toBe(0);
      expect(errors).toEqual([]);
      expect(JSON.parse(logs[0] ?? "[]")).toHaveLength(2);
      const firstCallOptions = loadSpy.mock.calls[0]?.[0] as { resourceDir?: string } | undefined;
      expect(firstCallOptions?.resourceDir).toBe(resourceDir);
    } finally {
      loadSpy.mockRestore();
    }
  }
});

test("runCli renders wakati output when --wakati is requested", async () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);

  try {
    const exitCode = await runCliMaybeAsync(["--dict-path", "/tmp/dict", "--wakati", "--text", "ignored"], {}, io);

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(logs[0]).toBe("すもも もも");
    expect(fakeTokenizer.lastTokenizeArgs()).toEqual({ text: "ignored", mode: "C" });
    expect(loadSpy).toHaveBeenCalledTimes(1);
  } finally {
    loadSpy.mockRestore();
  }
});

for (const [flag, expectedFormat] of [
  ["--wakati", "wakati"],
  ["--split-sentences", "normal"],
] as const) {
  test(`runCli accepts positional file input after ${flag}`, async () => {
    const { io, logs, errors } = createCapturedIo();
    const fakeTokenizer = createFakeTokenizer();
    const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);
    const inputText = "file input after boolean flag";
    const inputPath = createTempInputFile(`input-${flag.slice(2)}.txt`, inputText);

    try {
      const exitCode = await runCliMaybeAsync(["--dict-path", "/tmp/dict", flag, inputPath], {}, io);

      expect(exitCode).toBe(0);
      expect(errors).toEqual([]);
      expect(fakeTokenizer.lastTokenizeArgs()).toEqual({ text: inputText, mode: "C" });
      if (expectedFormat === "wakati") {
        expect(logs[0]).toBe("すもも もも");
      } else {
        expect(logs[0]).toBe(JSON.stringify(SAMPLE_MORPHEMES, null, 2));
      }
    } finally {
      loadSpy.mockRestore();
    }
  });
}

test("runCli renders all-field output when --all is requested", async () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);

  try {
    const exitCode = await runCliMaybeAsync(["--dict-path", "/tmp/dict", "--all", "--text", "ignored"], {}, io);

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(logs[0]).toBe(JSON.stringify(SAMPLE_MORPHEMES, null, 2));
    expect(fakeTokenizer.lastTokenizeArgs()).toEqual({ text: "ignored", mode: "C" });
    expect(loadSpy).toHaveBeenCalledTimes(1);
  } finally {
    loadSpy.mockRestore();
  }
});

test("runCli rejects --wakati and --all together", async () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);

  try {
    const exitCode = await runCliMaybeAsync(["--dict-path", "/tmp/dict", "--wakati", "--all", "--text", "ignored"], {}, io);

    expect(exitCode).toBe(1);
    expect(errors[0]).toContain("[INVALID_ARGUMENT] Cannot combine --wakati and --all.");
    expect(logs[0]).toContain("Usage:");
    expect(loadSpy).not.toHaveBeenCalled();
  } finally {
    loadSpy.mockRestore();
  }
});

for (const [flag, value] of [["--wakati", "true"]] as const) {
  test(`runCli rejects ${flag}=${value} as invalid boolean flag syntax`, async () => {
    const { io, logs, errors } = createCapturedIo();
    const fakeTokenizer = createFakeTokenizer();
    const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);

    try {
      const exitCode = await runCliMaybeAsync(["--dict-path", "/tmp/dict", `${flag}=${value}`, "--text", "ignored"], {}, io);

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

test("runCli treats --output - as stdout", async () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);

  try {
    const exitCode = await runCliMaybeAsync(["--dict-path", "/tmp/dict", "--wakati", "--output", "-", "--text", "ignored"], {}, io);

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(logs[0]).toBe("すもも もも");
    expect(fakeTokenizer.lastTokenizeArgs()).toEqual({ text: "ignored", mode: "C" });
    expect(loadSpy).toHaveBeenCalledTimes(1);
  } finally {
    loadSpy.mockRestore();
  }
});

test("runCli reports a coded error when output file writing fails", async () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);
  const missingDir = `/tmp/sudachi-bun-missing-${crypto.randomUUID()}`;
  const outputPath = `${missingDir}/tokens.json`;

  try {
    const exitCode = await runCliMaybeAsync(["--dict-path", "/tmp/dict", "--wakati", "--output", outputPath, "--text", "ignored"], {}, io);

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

test("runCli rejects an invalid --resource-dir path with a coded error", async () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);
  const missingDir = `/tmp/sudachi-bun-resource-missing-${crypto.randomUUID()}`;

  try {
    const exitCode = await runCliMaybeAsync(["--dict-path", "/tmp/dict", "--resource-dir", missingDir, "--text", "ignored"], {}, io);

    expect(exitCode).toBe(1);
    expect(errors[0]).toBe(`[INVALID_ARGUMENT] Invalid resource directory: ${missingDir}`);
    expect(logs[0]).toContain("Usage:");
    expect(loadSpy).not.toHaveBeenCalled();
  } finally {
    loadSpy.mockRestore();
  }
});

test("runCli reads file input from a positional argument", async () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);
  const inputText = "file input via positional arg";
  const inputPath = createTempInputFile("input.txt", inputText);

  try {
    const exitCode = await runCliMaybeAsync(["--dict-path", "/tmp/dict", inputPath], {}, io);

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(fakeTokenizer.lastTokenizeArgs()).toEqual({ text: inputText, mode: "C" });
    expect(logs[0]).toBe(JSON.stringify(SAMPLE_MORPHEMES, null, 2));
  } finally {
    loadSpy.mockRestore();
  }
});

test("runCli reports a missing leading input file as an input read failure", async () => {
  const { io, logs, errors } = createCapturedIo();
  const missingPath = join(tmpdir(), `sudachi-bun-missing-${crypto.randomUUID()}.txt`);

  const exitCode = await runCliMaybeAsync([missingPath, "--dict-path", "/tmp/dict"], {}, io);

  expect(exitCode).toBe(1);
  expect(errors[0]).toContain(`[INVALID_ARGUMENT] Failed to read input file ${missingPath}:`);
  expect(logs[0]).toContain("Usage:");
  expect(logs[0]).not.toContain("Commands:");
});

for (const name of ["build", "ubuild", "dump"] as const) {
  test(`runCli treats ${name} as a positional file name when it is not the first token`, async () => {
    const { io, logs, errors } = createCapturedIo();
    const fakeTokenizer = createFakeTokenizer();
    const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);
    const inputText = `positional file named ${name}`;
    const inputPath = createTempInputFile(name, inputText);

    try {
      const exitCode = await runCliMaybeAsync(["--dict-path", "/tmp/dict", inputPath], {}, io);

      expect(exitCode).toBe(0);
      expect(errors).toEqual([]);
      expect(fakeTokenizer.lastTokenizeArgs()).toEqual({ text: inputText, mode: "C" });
      expect(logs[0]).toBe(JSON.stringify(SAMPLE_MORPHEMES, null, 2));
    } finally {
      loadSpy.mockRestore();
    }
  });
}

test("runCli treats buidl as a positional file name when it is the first token", async () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);
  const inputText = "positional file named buidl";
  const inputPath = createTempInputFile("buidl", inputText);
  const originalCwd = process.cwd();

  process.chdir(dirname(inputPath));

  try {
    const exitCode = await runCliMaybeAsync(["buidl", "--dict-path", "/tmp/dict"], {}, io);

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(fakeTokenizer.lastTokenizeArgs()).toEqual({ text: inputText, mode: "C" });
    expect(logs[0]).toBe(JSON.stringify(SAMPLE_MORPHEMES, null, 2));
  } finally {
    process.chdir(originalCwd);
    loadSpy.mockRestore();
  }
});

test("runCli concatenates multiple positional files in order", async () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);
  const firstPath = createTempInputFile("input-a.txt", "first");
  const secondPath = createTempInputFile("input-b.txt", "second");
  const combinedText = "first\nsecond";

  try {
    const exitCode = await runCliMaybeAsync(["--dict-path", "/tmp/dict", firstPath, secondPath], {}, io);

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(fakeTokenizer.lastTokenizeArgs()).toEqual({ text: combinedText, mode: "C" });
    expect(logs[0]).toBe(JSON.stringify(SAMPLE_MORPHEMES, null, 2));
  } finally {
    loadSpy.mockRestore();
  }
});

test("runCli reads piped stdin when no file arguments are present", async () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);
  const inputText = "stdin input via pipe";

  try {
    await withMockedStdin(inputText, async () => {
      const exitCode = await runCliMaybeAsync(["--dict-path", "/tmp/dict"], {}, io);

      expect(exitCode).toBe(0);
      expect(errors).toEqual([]);
      expect(fakeTokenizer.lastTokenizeArgs()).toEqual({ text: inputText, mode: "C" });
      expect(logs[0]).toBe(JSON.stringify(SAMPLE_MORPHEMES, null, 2));
    });
  } finally {
    loadSpy.mockRestore();
  }
});

test("runCli rejects combining --text with positional file input", async () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);
  const inputPath = createTempInputFile("input.txt", "file input");
  const explicitText = "explicit text wins";

  try {
    const exitCode = await runCliMaybeAsync(["--dict-path", "/tmp/dict", "--text", explicitText, inputPath], {}, io);

    expect(exitCode).toBe(1);
    expect(errors[0]).toBe("[INVALID_ARGUMENT] Cannot combine --text with positional file input.");
    expect(logs[0]).toContain("Usage:");
    expect(fakeTokenizer.lastTokenizeArgs()).toBeUndefined();
  } finally {
    loadSpy.mockRestore();
  }
});

test("runCli rejects combining --text with piped stdin", async () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);
  const explicitText = "explicit text wins";

  try {
    await withMockedStdin("stdin input", async () => {
      const exitCode = await runCliMaybeAsync(["--dict-path", "/tmp/dict", "--text", explicitText], {}, io);

      expect(exitCode).toBe(1);
    });
    expect(errors[0]).toBe("[INVALID_ARGUMENT] Cannot combine --text with stdin input.");
    expect(logs[0]).toContain("Usage:");
    expect(fakeTokenizer.lastTokenizeArgs()).toBeUndefined();
  } finally {
    loadSpy.mockRestore();
  }
});

test("runCli rejects combining positional file input with piped stdin", async () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);
  const inputPath = createTempInputFile("input.txt", "file input wins");
  const stdinText = "stdin input loses";

  try {
    await withMockedStdin(stdinText, async () => {
      const exitCode = await runCliMaybeAsync(["--dict-path", "/tmp/dict", inputPath], {}, io);

      expect(exitCode).toBe(1);
    });
    expect(errors[0]).toBe("[INVALID_ARGUMENT] Cannot combine positional file input with stdin input.");
    expect(logs[0]).toContain("Usage:");
    expect(fakeTokenizer.lastTokenizeArgs()).toBeUndefined();
  } finally {
    loadSpy.mockRestore();
  }
});

for (const [scenarioName, inputBuilder] of [
  ["empty file input", async () => createTempInputFile("empty.txt", "")],
  ["empty stdin input", async () => "stdin"],
] as const) {
  test(`runCli reports an error for ${scenarioName}`, async () => {
    const { io, logs, errors } = createCapturedIo();
    const fakeTokenizer = createFakeTokenizer();
    const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);

    try {
      if (scenarioName === "empty file input") {
        const inputPath = await inputBuilder();
        const exitCode = await runCliMaybeAsync(["--dict-path", "/tmp/dict", inputPath], {}, io);

        expect(exitCode).toBe(1);
      } else {
        await withMockedStdin("", async () => {
          const exitCode = await runCliMaybeAsync(["--dict-path", "/tmp/dict"], {}, io);

          expect(exitCode).toBe(1);
        });
      }

      expect(errors[0]).toMatch(/\b(empty|no input)\b/i);
      expect(logs[0]).toContain("Usage:");
      expect(fakeTokenizer.lastTokenizeArgs()).toBeUndefined();
    } finally {
      loadSpy.mockRestore();
    }
  });
}

test("runCli prints a coded error when mode is invalid", async () => {
  const logs: string[] = [];
  const errors: string[] = [];

  const exitCode = await runCliMaybeAsync(
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

test("runCli prints a coded error when a required argument is missing", async () => {
  const { io, logs, errors } = createCapturedIo();

  const exitCode = await runCliMaybeAsync(["--dict-path", "--mode=C"], {}, io);

  expect(exitCode).toBe(1);
  expect(errors[0]).toBe("[MISSING_ARGUMENT] Missing value for --dict-path");
  expect(logs[0]).toContain("Usage:");
});

test("runCli treats a leading typo-like token as positional input instead of an unknown subcommand", async () => {
  const { io, logs, errors } = createCapturedIo();

  const exitCode = await runCliMaybeAsync(["buidl", "--dict-path", "/tmp/dict"], {}, io);

  expect(exitCode).toBe(1);
  expect(errors[0]).toContain("[INVALID_ARGUMENT] Failed to read input file buidl:");
  expect(errors[0]).not.toContain("Unknown subcommand");
  expect(logs[0]).toContain("Usage:");
});

test("runCli rejects an unknown flag before treating the next token as a subcommand", async () => {
  const { io, logs, errors } = createCapturedIo();

  const exitCode = await runCliMaybeAsync(["--dic-path", "/tmp/a"], {}, io);

  expect(exitCode).toBe(1);
  expect(errors[0]).toBe("[INVALID_ARGUMENT] Unknown flag: --dic-path");
  expect(logs[0]).toContain("Usage:");
  expect(logs[0]).toContain("Commands:");
});

test("runCli rejects an unknown flag even when the next token looks like a subcommand", async () => {
  const { io, logs, errors } = createCapturedIo();

  const exitCode = await runCliMaybeAsync(["--unknown", "build", "--dict-path", "/tmp/dic"], {}, io);

  expect(exitCode).toBe(1);
  expect(errors[0]).toBe("[INVALID_ARGUMENT] Unknown flag: --unknown");
  expect(logs[0]).toContain("Usage:");
  expect(logs[0]).toContain("Commands:");
});

for (const command of ["build", "ubuild", "dump"] as const) {
  test(`runCli prints help for ${command}`, async () => {
    const { io, logs, errors } = createCapturedIo();

    const exitCode = await runCliMaybeAsync([command, "--help"], {}, io);

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(logs.join("\n")).toContain("Usage:");
  });
}

test("runCli returns an invalid argument error when build is requested without an implementation", async () => {
  const { io, logs, errors } = createCapturedIo();

  const exitCode = await runCliMaybeAsync(["build"], {}, io);

  expect(exitCode).toBe(1);
  expect(errors[0]).toContain("[INVALID_ARGUMENT]");
  expect(logs[0]).toContain("Usage:");
});
