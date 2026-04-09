import { expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Tokenizer } from "./core.ts";
import { runCli } from "./cli.ts";
import { SentenceSplitter } from "./sentence-splitter.ts";

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
  const lookupCalls: string[] = [];

  return {
    lastTokenizeArgs: () => tokenizeCalls[tokenizeCalls.length - 1],
    lookupCalls: () => [...lookupCalls],
    tokenizeCalls: () => [...tokenizeCalls],
    tokenizer: {
      tokenize(text: string, mode: string) {
        tokenizeCalls.push({ text, mode });
        return SAMPLE_MORPHEMES as unknown as ReturnType<Tokenizer["tokenize"]>;
      },
      lookup(text: string) {
        lookupCalls.push(text);
        return [
          {
            surface: text,
            pos: "名詞,普通名詞,一般,*,*,*",
            wordId: "(0, 1)",
            dictionaryId: 0,
            isOov: false,
          },
        ] as ReturnType<Tokenizer["lookup"]>;
      },
      close() {},
    },
  };
}

function createTempInputFile(name: string, contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), "sudachi-bun-cli-input-"));
  const filePath = join(dir, name);
  fs.writeFileSync(filePath, contents, "utf8");
  return filePath;
}

async function runCliMaybeAsync(
  argv: string[],
  env: NodeJS.ProcessEnv = {},
  io: { log(message: string): void; error(message: string): void } = console,
): Promise<number> {
  return await runCli(argv, env, io);
}

test("runCli requires an explicit subcommand", async () => {
  const { io, logs, errors } = createCapturedIo();

  const exitCode = await runCliMaybeAsync([], {}, io);

  expect(exitCode).toBe(1);
  expect(errors[0]).toContain("[INVALID_ARGUMENT] A subcommand is required");
  expect(logs[0]).toContain("Commands:");
  expect(logs[0]).toContain("tokenize  Tokenize text.");
});

test("runCli tokenizes text when tokenize subcommand is specified", async () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);

  try {
    const exitCode = await runCliMaybeAsync(["tokenize", "--dict-path", "/tmp/dict", "--text", "ignored"], {}, io);

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(fakeTokenizer.lastTokenizeArgs()).toEqual({ text: "ignored", mode: "C" });
    expect(logs[0]).toBe(JSON.stringify(SAMPLE_MORPHEMES, null, 2));
    expect(loadSpy).toHaveBeenCalledTimes(1);
  } finally {
    loadSpy.mockRestore();
  }
});

test("runCli supports wakati output", async () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);

  try {
    const exitCode = await runCliMaybeAsync(
      ["tokenize", "--dict-path", "/tmp/dict", "--text", "ignored", "--wakati"],
      {},
      io,
    );

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(logs[0]).toBe("すもも もも");
  } finally {
    loadSpy.mockRestore();
  }
});

test("runCli rejects --resource_dir alias", async () => {
  const { io, logs, errors } = createCapturedIo();

  const exitCode = await runCliMaybeAsync(
    ["tokenize", "--dict-path", "/tmp/dict", "--resource_dir", "/tmp/resources", "--text", "x"],
    {},
    io,
  );

  expect(exitCode).toBe(1);
  expect(errors[0]).toBe("[INVALID_ARGUMENT] Unknown flag: --resource_dir");
  expect(logs[0]).toContain("Usage:");
  expect(logs[0]).toContain("tokenize");
});

test("runCli rejects when no input source is provided", async () => {
  const { io, logs, errors } = createCapturedIo();

  const exitCode = await runCliMaybeAsync(["tokenize", "--dict-path", "/tmp/dict"], {}, io);

  expect(exitCode).toBe(1);
  expect(errors[0]).toBe("[INVALID_ARGUMENT] No input was resolved from --text, positional file paths, or stdin.");
  expect(logs[0]).toContain("Usage:");
  expect(logs[0]).toContain("tokenize");
});

test("runCli rejects unknown subcommand typos", async () => {
  const { io, logs, errors } = createCapturedIo();

  const exitCode = await runCliMaybeAsync(["buidl"], {}, io);

  expect(exitCode).toBe(1);
  expect(errors[0]).toBe("[INVALID_ARGUMENT] Unknown subcommand: buidl");
  expect(logs[0]).toContain("Commands:");
});

test("runCli handles sentence splitting and byte offsets", async () => {
  const { io, logs, errors } = createCapturedIo();
  const tokenizeCalls: Array<{ text: string; mode: string }> = [];
  const splitterTarget = {
    split(_text: string) {
      return [
        { text: "😀。", start: 0, end: 7 },
        { text: "B？", start: 7, end: 11 },
      ];
    },
  };
  const fakeSplitter = {
    split: spyOn(splitterTarget, "split"),
    close() {},
  };
  const createSpy = spyOn(SentenceSplitter, "create").mockReturnValue(fakeSplitter as never);
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
    const exitCode = await runCliMaybeAsync(
      ["tokenize", "--dict-path", "/tmp/dict", "--split-sentences", "--text", "😀。B？"],
      {},
      io,
    );

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ dictPath: "/tmp/dict" }));
    expect(fakeSplitter.split).toHaveBeenCalledTimes(1);
    expect(fakeSplitter.split).toHaveBeenCalledWith("😀。B？");
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
    createSpy.mockRestore();
    fakeSplitter.split.mockRestore();
    loadSpy.mockRestore();
  }
});

test("runCli tokenizes positional file input", async () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);
  const inputPath = createTempInputFile("input.txt", "file input");

  try {
    const exitCode = await runCliMaybeAsync(["tokenize", "--dict-path", "/tmp/dict", inputPath], {}, io);

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(fakeTokenizer.lastTokenizeArgs()).toEqual({ text: "file input", mode: "C" });
    expect(logs[0]).toBe(JSON.stringify(SAMPLE_MORPHEMES, null, 2));
  } finally {
    loadSpy.mockRestore();
  }
});

test("runCli emits lookup debug output via stderr", async () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(() => fakeTokenizer.tokenizer as never);

  try {
    const exitCode = await runCliMaybeAsync(
      ["tokenize", "--dict-path", "/tmp/dict", "--debug", "--text", "東京"],
      {},
      io,
    );

    expect(exitCode).toBe(0);
    expect(logs[0]).toBe(JSON.stringify(SAMPLE_MORPHEMES, null, 2));
    expect(fakeTokenizer.lookupCalls()).toEqual(["東京"]);
    expect(errors).toContain(
      "[debug] lookup=[{\"surface\":\"東京\",\"pos\":\"名詞,普通名詞,一般,*,*,*\",\"wordId\":\"(0, 1)\",\"dictionaryId\":0,\"isOov\":false}]",
    );
  } finally {
    loadSpy.mockRestore();
  }
});

test("runCli keeps debug tokenize working when lookup is unavailable", async () => {
  const { io, logs, errors } = createCapturedIo();
  const loadSpy = spyOn(Tokenizer, "load").mockImplementation(
    () =>
      ({
        tokenize() {
          return SAMPLE_MORPHEMES as unknown as ReturnType<Tokenizer["tokenize"]>;
        },
        lookup() {
          throw new Error("missing lookup symbols");
        },
        close() {},
      }) as never,
  );

  try {
    const exitCode = await runCliMaybeAsync(
      ["tokenize", "--dict-path", "/tmp/dict", "--debug", "--text", "東京"],
      {},
      io,
    );

    expect(exitCode).toBe(0);
    expect(logs[0]).toBe(JSON.stringify(SAMPLE_MORPHEMES, null, 2));
    expect(errors).toContain("[debug] lookup-unavailable=missing lookup symbols");
  } finally {
    loadSpy.mockRestore();
  }
});

test("runCli returns an error for unimplemented build command", async () => {
  const { io, logs, errors } = createCapturedIo();

  const exitCode = await runCliMaybeAsync(["build"], {}, io);

  expect(exitCode).toBe(1);
  expect(errors[0]).toContain("[INVALID_ARGUMENT] The build command is not implemented yet.");
  expect(logs[0]).toContain("bun run index.ts build [--help]");
});
