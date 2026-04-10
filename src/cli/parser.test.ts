import { expect, test } from "bun:test";

import { renderCliHelp } from "./help.ts";
import { parseArgValue, parseCliArgs } from "./parser.ts";
import type { CliCommandResult, CliHelpResult, CliHelpTarget, CliParseErrorResult } from "./types.ts";
import { SudachiError, type SudachiErrorCode } from "../types.ts";

function expectError(
  result: CliParseErrorResult,
  code: SudachiErrorCode,
  message: string,
  helpTarget: CliHelpTarget,
): void {
  expect(result.kind).toBe("error");
  expect(result.error).toBeInstanceOf(SudachiError);
  expect(result.error.code).toBe(code);
  expect(result.error.message).toBe(message);
  expect(result.helpTarget).toBe(helpTarget);
}

test("parseArgValue reads inline and positional values for known flags", () => {
  expect(parseArgValue(["--dict-path=/tmp/dict"], "dict-path")).toBe("/tmp/dict");
  expect(parseArgValue(["--dict-path", "/tmp/dict"], "dict-path")).toBe("/tmp/dict");
});

test("parseArgValue rejects a missing value when the next token is another known flag", () => {
  expect(() => parseArgValue(["--dict-path", "--mode", "C"], "dict-path")).toThrow(
    new SudachiError("Missing value for --dict-path", {
      code: "MISSING_ARGUMENT",
    }),
  );
});

test("parseArgValue rejects boolean flags with inline values", () => {
  expect(() => parseArgValue(["--debug=true"], "debug")).toThrow(
    new SudachiError("Invalid boolean flag syntax: --debug=true", {
      code: "INVALID_ARGUMENT",
    }),
  );
});

test("parseCliArgs returns top-level help for --help", () => {
  const result = parseCliArgs(["--help"]);

  expect(result).toEqual<CliHelpResult>({
    kind: "help",
    target: "top-level",
  });
});

test("parseCliArgs returns command-specific help for tokenize", () => {
  const result = parseCliArgs(["tokenize", "--help"]);

  expect(result).toEqual<CliHelpResult>({
    kind: "help",
    target: "tokenize",
  });
});

test("parseCliArgs requires an explicit subcommand", () => {
  const result = parseCliArgs([]);

  expectError(
    result as CliParseErrorResult,
    "INVALID_ARGUMENT",
    "A subcommand is required. Use tokenize, build, ubuild, or dump.",
    "top-level",
  );
});

test("parseCliArgs rejects a typo-like first positional token as an unknown subcommand", () => {
  const result = parseCliArgs(["buidl"]);

  expectError(result as CliParseErrorResult, "INVALID_ARGUMENT", "Unknown subcommand: buidl", "top-level");
});

test("parseCliArgs rejects unknown flags before a valid subcommand", () => {
  const result = parseCliArgs(["--unknown", "build"]);

  expectError(result as CliParseErrorResult, "INVALID_ARGUMENT", "Unknown flag: --unknown", "top-level");
});

test("parseCliArgs rejects the unsupported --resource_dir alias", () => {
  const result = parseCliArgs(["tokenize", "--resource_dir", "/tmp/resources", "--dict-path", "/tmp/dict"]);

  expectError(result as CliParseErrorResult, "INVALID_ARGUMENT", "Unknown flag: --resource_dir", "tokenize");
});

test("parseCliArgs reports missing tokenize dict-path with tokenize help", () => {
  const result = parseCliArgs(["tokenize"]);

  expectError(result as CliParseErrorResult, "MISSING_ARGUMENT", "Missing value for --dict-path", "tokenize");
});

test("parseCliArgs rejects boolean flags with = syntax", () => {
  const result = parseCliArgs(["tokenize", "--dict-path", "/tmp/dict", "--debug=true"]);

  expectError(result as CliParseErrorResult, "INVALID_ARGUMENT", "Invalid boolean flag syntax: --debug=true", "tokenize");
});

test("parseCliArgs resolves tokenize commands into a discriminated union", () => {
  const result = parseCliArgs([
    "tokenize",
    "--dict-path",
    "/tmp/dict",
    "--projection",
    "surface",
    "--config-path",
    "/tmp/config",
    "--library-path",
    "/tmp/lib.dylib",
    "--resource-dir",
    "/tmp/resources",
    "--mode",
    "A",
    "--text",
    "hello",
    "--wakati",
    "--split-sentences",
    "--debug",
    "--output",
    "-",
    "input.txt",
  ]);

  expect(result.kind).toBe("command");
  const command = (result as CliCommandResult).command;
  expect(command).toMatchObject({
    kind: "tokenize",
    dictPath: "/tmp/dict",
    projection: "surface",
    configPath: "/tmp/config",
    libraryPath: "/tmp/lib.dylib",
    resourceDir: "/tmp/resources",
    mode: "A",
    text: "hello",
    wakati: true,
    all: false,
    splitSentences: true,
    debug: true,
    outputPath: "-",
    positionals: ["input.txt"],
  });
});

test("parseCliArgs separates build subcommand from its positional arguments", () => {
  const result = parseCliArgs(["build", "dictionary.sudachi"]);

  expect(result.kind).toBe("command");
  expect((result as CliCommandResult).command).toEqual({
    kind: "build",
    positionals: ["dictionary.sudachi"],
  });
});

test("parseCliArgs rejects tokenize-only flags for build/ubuild/dump", () => {
  for (const command of ["build", "ubuild", "dump"] as const) {
    const result = parseCliArgs([command, "--dict-path", "/tmp/dict"]);

    expectError(result as CliParseErrorResult, "INVALID_ARGUMENT", "Unknown flag: --dict-path", command);
  }
});

test("renderCliHelp returns distinct help text for top-level and subcommands", () => {
  const topLevel = renderCliHelp("top-level");
  const tokenize = renderCliHelp("tokenize");
  const build = renderCliHelp("build");
  const ubuild = renderCliHelp("ubuild");
  const dump = renderCliHelp("dump");

  expect(topLevel).toContain("Commands:");
  expect(topLevel).toContain("tokenize  Tokenize text with a required projection.");
  expect(tokenize).toContain("Usage:");
  expect(tokenize).toContain("--projection <mode>");
  expect(tokenize).toContain("--resource-dir <path>");
  expect(tokenize).not.toContain("--resource_dir");
  expect(build).toContain("bun run index.ts build [--help]");
  expect(build).toContain("Not implemented yet.");
  expect(ubuild).toContain("bun run index.ts ubuild [--help]");
  expect(dump).toContain("bun run index.ts dump [--help]");
});
