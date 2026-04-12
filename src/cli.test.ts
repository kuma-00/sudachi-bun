import { expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCli } from "./cli.ts";
import * as core from "./core.ts";
import * as sentenceSplitter from "./sentence-splitter.ts";

type Projection = "surface" | "normalized" | "dictionary_form" | "reading";

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
    beginChar: 0,
    endChar: 3,
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
    beginChar: 3,
    endChar: 5,
    wordId: "2",
    posId: 1,
    dictionaryId: 0,
    isOov: false,
    synonymGroupIds: [],
  },
] as const;

const NORMALIZED_SAMPLE_MORPHEMES = [
  {
    surface: "スモモ",
    normalized: "すもも",
    dictionaryForm: "すもも",
    reading: "スモモ",
    pos: "名詞",
    begin: 0,
    end: 3,
    beginChar: 0,
    endChar: 3,
    wordId: "1",
    posId: 1,
    dictionaryId: 0,
    isOov: false,
    synonymGroupIds: [],
  },
  {
    surface: "モモ",
    normalized: "もも",
    dictionaryForm: "もも",
    reading: "モモ",
    pos: "名詞",
    begin: 3,
    end: 5,
    beginChar: 3,
    endChar: 5,
    wordId: "2",
    posId: 1,
    dictionaryId: 0,
    isOov: false,
    synonymGroupIds: [],
  },
] as const;

function createFakeTokenizer() {
  const tokenizeCalls: Array<{
    text: string;
    mode: string;
    projection: Projection;
  }> = [];
  const lookupCalls: Array<{ surface: string; projection: Projection }> = [];

  return {
    lastTokenizeArgs: () => tokenizeCalls[tokenizeCalls.length - 1],
    lookupCalls: () => [...lookupCalls],
    tokenizeCalls: () => [...tokenizeCalls],
    tokenizer: {
      tokenize({
        text = "",
        mode = "C",
        projection = "surface",
      }: {
        text: string;
        mode?: string;
        projection?: Projection;
      }) {
        tokenizeCalls.push({ text, mode, projection });
        return projection === "normalized"
          ? [...NORMALIZED_SAMPLE_MORPHEMES]
          : [...SAMPLE_MORPHEMES];
      },
      lookup({
        surface = "",
        projection = "surface",
      }: {
        surface: string;
        projection?: Projection;
      }) {
        lookupCalls.push({ surface, projection });
        return [
          {
            surface,
            pos: "名詞,普通名詞,一般,*,*,*",
            wordId: "(0, 1)",
            dictionaryId: 0,
            isOov: false,
          },
        ];
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
  expect(logs[0]).toContain(
    "tokenize  Tokenize text with a required projection.",
  );
});

test("runCli tokenizes text when tokenize subcommand is specified", async () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const closeSpy = spyOn(fakeTokenizer.tokenizer, "close");
  const loadSpy = spyOn(core, "createTokenizer").mockImplementation(
    () => fakeTokenizer.tokenizer as never,
  );

  try {
    const exitCode = await runCliMaybeAsync(
      [
        "tokenize",
        "--dict-path",
        "/tmp/dict",
        "--projection",
        "surface",
        "--text",
        "ignored",
      ],
      {},
      io,
    );

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(fakeTokenizer.lastTokenizeArgs()).toEqual({
      text: "ignored",
      mode: "C",
      projection: "surface",
    });
    expect(logs[0]).toBe(JSON.stringify(SAMPLE_MORPHEMES, null, 2));
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  } finally {
    loadSpy.mockRestore();
    closeSpy.mockRestore();
  }
});

test("runCli supports wakati output", async () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(core, "createTokenizer").mockImplementation(
    () => fakeTokenizer.tokenizer as never,
  );

  try {
    const exitCode = await runCliMaybeAsync(
      [
        "tokenize",
        "--dict-path",
        "/tmp/dict",
        "--projection",
        "surface",
        "--text",
        "ignored",
        "--wakati",
      ],
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

test("runCli rejects tokenize when projection is omitted", async () => {
  const { io, logs, errors } = createCapturedIo();

  const exitCode = await runCliMaybeAsync(
    ["tokenize", "--dict-path", "/tmp/dict", "--text", "x"],
    {},
    io,
  );

  expect(exitCode).toBe(1);
  expect(errors[0]).toContain("projection");
  expect(logs[0]).toContain("Usage:");
  expect(logs[0]).toContain("tokenize");
});

test("runCli rejects --resource_dir alias", async () => {
  const { io, logs, errors } = createCapturedIo();

  const exitCode = await runCliMaybeAsync(
    [
      "tokenize",
      "--dict-path",
      "/tmp/dict",
      "--projection",
      "surface",
      "--resource_dir",
      "/tmp/resources",
      "--text",
      "x",
    ],
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

  const exitCode = await runCliMaybeAsync(
    ["tokenize", "--dict-path", "/tmp/dict", "--projection", "surface"],
    {},
    io,
  );

  expect(exitCode).toBe(1);
  expect(errors[0]).toBe(
    "[INVALID_ARGUMENT] No input was resolved from --text, positional file paths, or stdin.",
  );
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

test("runCli handles sentence splitting and byte/char offsets", async () => {
  const { io, logs, errors } = createCapturedIo();
  const tokenizeCalls: Array<{
    text: string;
    mode: string;
    projection: Projection;
  }> = [];
  const splitterTarget = {
    split(_text: string) {
      return [
        { text: "😀。", start: 0, end: 7 },
        { text: "B？", start: 7, end: 11 },
      ];
    },
  };
  const splitterCloseTarget: { close: () => void } = { close() {} };
  const splitterCloseSpy = spyOn(splitterCloseTarget, "close");
  const fakeSplitter = {
    split: spyOn(splitterTarget, "split"),
    close: splitterCloseSpy,
  };
  const tokenizeSpy = spyOn(core, "createTokenizer").mockImplementation(
    () =>
      ({
        tokenize({
          text = "",
          mode = "C",
          projection = "surface",
        }: {
          text: string;
          mode?: string;
          projection?: Projection;
        }) {
          tokenizeCalls.push({ text, mode, projection });
          const morphemes =
            projection === "normalized"
              ? NORMALIZED_SAMPLE_MORPHEMES
              : SAMPLE_MORPHEMES;
          return [
            {
              ...morphemes[0],
              surface: text,
              begin: 0,
              end: Buffer.byteLength(text, "utf8"),
              beginChar: 0,
              endChar: text.length,
            },
          ];
        },
        lookup() {
          return [];
        },
        close() {},
      }) as never,
  );
  const splitSpy = spyOn(
    sentenceSplitter,
    "createSentenceSplitter",
  ).mockImplementation(() => fakeSplitter as never);

  try {
    const exitCode = await runCliMaybeAsync(
      [
        "tokenize",
        "--dict-path",
        "/tmp/dict",
        "--projection",
        "surface",
        "--split-sentences",
        "--text",
        "😀。B？",
      ],
      {},
      io,
    );

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(tokenizeSpy).toHaveBeenCalledTimes(1);
    expect(tokenizeSpy).toHaveBeenCalledWith(
      expect.objectContaining({ dictPath: "/tmp/dict", splitSentences: true }),
    );
    expect(splitSpy).toHaveBeenCalledTimes(1);
    expect(splitSpy).toHaveBeenCalledWith(
      expect.objectContaining({ dictPath: "/tmp/dict", splitSentences: true }),
    );
    expect(fakeSplitter.split).toHaveBeenCalledTimes(1);
    expect(fakeSplitter.split).toHaveBeenCalledWith("😀。B？");
    expect(splitterCloseSpy).toHaveBeenCalledTimes(1);
    expect(tokenizeCalls).toEqual([
      { text: "😀。", mode: "C", projection: "surface" },
      { text: "B？", mode: "C", projection: "surface" },
    ]);

    const output = JSON.parse(logs[0] ?? "[]") as Array<{
      begin: number;
      end: number;
      beginChar: number;
      endChar: number;
    }>;
    expect(output.map(({ begin, end }) => ({ begin, end }))).toEqual([
      { begin: 0, end: 7 },
      { begin: 7, end: 11 },
    ]);
    expect(
      output.map(({ beginChar, endChar }) => ({ beginChar, endChar })),
    ).toEqual([
      { beginChar: 0, endChar: 3 },
      { beginChar: 3, endChar: 5 },
    ]);
  } finally {
    tokenizeSpy.mockRestore();
    splitSpy.mockRestore();
    fakeSplitter.split.mockRestore();
    splitterCloseSpy.mockRestore();
  }
});

test("runCli tokenizes positional file input", async () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(core, "createTokenizer").mockImplementation(
    () => fakeTokenizer.tokenizer as never,
  );
  const inputPath = createTempInputFile("input.txt", "file input");

  try {
    const exitCode = await runCliMaybeAsync(
      [
        "tokenize",
        "--dict-path",
        "/tmp/dict",
        "--projection",
        "surface",
        inputPath,
      ],
      {},
      io,
    );

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(fakeTokenizer.lastTokenizeArgs()).toEqual({
      text: "file input",
      mode: "C",
      projection: "surface",
    });
    expect(logs[0]).toBe(JSON.stringify(SAMPLE_MORPHEMES, null, 2));
  } finally {
    loadSpy.mockRestore();
  }
});

test("runCli emits lookup debug output via stderr", async () => {
  const { io, logs, errors } = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(core, "createTokenizer").mockImplementation(
    () => fakeTokenizer.tokenizer as never,
  );

  try {
    const exitCode = await runCliMaybeAsync(
      [
        "tokenize",
        "--dict-path",
        "/tmp/dict",
        "--projection",
        "surface",
        "--debug",
        "--text",
        "東京",
      ],
      {},
      io,
    );

    expect(exitCode).toBe(0);
    expect(logs[0]).toBe(JSON.stringify(SAMPLE_MORPHEMES, null, 2));
    expect(fakeTokenizer.lookupCalls()).toEqual([
      { surface: "東京", projection: "surface" },
    ]);
    expect(errors).toContain(
      '[debug] lookup=[{"surface":"東京","pos":"名詞,普通名詞,一般,*,*,*","wordId":"(0, 1)","dictionaryId":0,"isOov":false}]',
    );
  } finally {
    loadSpy.mockRestore();
  }
});

test("runCli keeps debug tokenize working when lookup is unavailable", async () => {
  const { io, logs, errors } = createCapturedIo();
  const loadSpy = spyOn(core, "createTokenizer").mockImplementation(
    () =>
      ({
        tokenize(_args: unknown) {
          return [...SAMPLE_MORPHEMES];
        },
        lookup(_args: unknown) {
          throw new Error("missing lookup symbols");
        },
        close() {},
      }) as never,
  );

  try {
    const exitCode = await runCliMaybeAsync(
      [
        "tokenize",
        "--dict-path",
        "/tmp/dict",
        "--projection",
        "surface",
        "--debug",
        "--text",
        "東京",
      ],
      {},
      io,
    );

    expect(exitCode).toBe(0);
    expect(logs[0]).toBe(JSON.stringify(SAMPLE_MORPHEMES, null, 2));
    expect(errors).toContain(
      "[debug] lookup-unavailable=missing lookup symbols",
    );
  } finally {
    loadSpy.mockRestore();
  }
});

test("runCli wakati output changes when projection changes", async () => {
  const surfaceIo = createCapturedIo();
  const normalizedIo = createCapturedIo();
  const fakeTokenizer = createFakeTokenizer();
  const loadSpy = spyOn(core, "createTokenizer").mockImplementation(
    () => fakeTokenizer.tokenizer as never,
  );

  try {
    const surfaceExitCode = await runCliMaybeAsync(
      [
        "tokenize",
        "--dict-path",
        "/tmp/dict",
        "--projection",
        "surface",
        "--wakati",
        "--text",
        "ignored",
      ],
      {},
      surfaceIo.io,
    );
    const normalizedExitCode = await runCliMaybeAsync(
      [
        "tokenize",
        "--dict-path",
        "/tmp/dict",
        "--projection",
        "normalized",
        "--wakati",
        "--text",
        "ignored",
      ],
      {},
      normalizedIo.io,
    );

    expect(surfaceExitCode).toBe(0);
    expect(normalizedExitCode).toBe(0);
    expect(surfaceIo.errors).toEqual([]);
    expect(normalizedIo.errors).toEqual([]);
    expect(surfaceIo.logs[0]).toBe("すもも もも");
    expect(normalizedIo.logs[0]).toBe("スモモ モモ");
    expect(surfaceIo.logs[0]).not.toBe(normalizedIo.logs[0]);
    expect(fakeTokenizer.tokenizeCalls()).toEqual([
      { text: "ignored", mode: "C", projection: "surface" },
      { text: "ignored", mode: "C", projection: "normalized" },
    ]);
  } finally {
    loadSpy.mockRestore();
  }
});

test("runCli returns an error for unimplemented build command", async () => {
  const { io, logs, errors } = createCapturedIo();

  const exitCode = await runCliMaybeAsync(["build"], {}, io);

  expect(exitCode).toBe(1);
  expect(errors[0]).toContain(
    "[INVALID_ARGUMENT] The build command is not implemented yet.",
  );
  expect(logs[0]).toContain("bun run index.ts build [--help]");
});
