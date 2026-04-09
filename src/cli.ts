import { statSync, writeFileSync } from "node:fs";

import { Tokenizer } from "./core.ts";
import {
  formatSudachiError,
  parseTokenizeMode,
  SudachiError,
  type TokenizeMode,
  type TokenizerLoadOptions,
} from "./types.ts";

const KNOWN_VALUE_FLAGS = new Set([
  "dict-path",
  "config-path",
  "library-path",
  "resource-dir",
  "resource_dir",
  "mode",
  "text",
  "output",
]);

const BOOLEAN_FLAGS = new Set(["wakati", "all", "split-sentences", "debug"]);

const KNOWN_FLAGS = new Set([...KNOWN_VALUE_FLAGS, ...BOOLEAN_FLAGS]);

const CLI_SUBCOMMANDS = ["build", "ubuild", "dump"] as const;
type CliSubcommand = (typeof CLI_SUBCOMMANDS)[number];
type CliCommandName = "tokenize" | CliSubcommand;
type CliHelpTarget = "top-level" | CliCommandName;
type TokenizeOutputFormat = "normal" | "wakati" | "all";

export interface TokenizeCliCommand extends TokenizerLoadOptions {
  mode: TokenizeMode;
  text: string;
  splitSentences?: boolean;
}

interface TokenizeExecutionCommand extends TokenizeCliCommand {
  splitSentences: boolean;
  format: TokenizeOutputFormat;
  outputPath?: string;
}

interface CliIO {
  log(message: string): void;
  error(message: string): void;
}

function missingArgumentError(name: string): SudachiError {
  return new SudachiError(`Missing value for --${name}`, {
    code: "MISSING_ARGUMENT",
  });
}

function unimplementedCommandError(name: CliSubcommand): SudachiError {
  return new SudachiError(`The ${name} command is not implemented yet. TODO delegate to dictionary layer.`, {
    code: "INVALID_ARGUMENT",
  });
}

function unknownSubcommandError(name: string): SudachiError {
  return new SudachiError(`Unknown subcommand: ${name}`, {
    code: "INVALID_ARGUMENT",
  });
}

function unknownFlagError(name: string): SudachiError {
  return new SudachiError(`Unknown flag: ${name}`, {
    code: "INVALID_ARGUMENT",
  });
}

function invalidBooleanFlagSyntaxError(name: string): SudachiError {
  return new SudachiError(`Invalid boolean flag syntax: ${name}`, {
    code: "INVALID_ARGUMENT",
  });
}

function invalidResourceDirError(value: string): SudachiError {
  return new SudachiError(`Invalid resource directory: ${value}`, {
    code: "INVALID_ARGUMENT",
  });
}

function isKnownFlagToken(value: string, knownFlags: ReadonlySet<string>): boolean {
  if (!value.startsWith("--")) {
    return false;
  }

  const flagBody = value.slice(2);
  const separatorIndex = flagBody.indexOf("=");
  const flagName = separatorIndex === -1 ? flagBody : flagBody.slice(0, separatorIndex);
  return knownFlags.has(flagName);
}

function isHelpToken(value: string): boolean {
  return value === "-h" || value === "--help";
}

function isKnownSubcommand(value: string): value is CliSubcommand {
  return CLI_SUBCOMMANDS.includes(value as CliSubcommand);
}

function hasFlag(argv: string[], name: string): boolean {
  const prefix = `--${name}`;
  return argv.some((arg) => arg === prefix || arg.startsWith(`${prefix}=`));
}

function parseAliasedArgValue(
  argv: string[],
  names: readonly string[],
  knownFlags: ReadonlySet<string> = KNOWN_FLAGS,
): string | undefined {
  for (const name of names) {
    const value = parseArgValue(argv, name, knownFlags);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function validateResourceDir(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    if (!statSync(value).isDirectory()) {
      throw invalidResourceDirError(value);
    }
  } catch {
    throw invalidResourceDirError(value);
  }

  return value;
}

function isSentenceBoundaryChar(char: string): boolean {
  return char === "。" || char === "！" || char === "？" || char === "!" || char === "?";
}

function splitTextIntoSentenceUnits(text: string): string[] {
  const units: string[] = [];
  let current = "";

  for (const char of text) {
    current += char;
    if (isSentenceBoundaryChar(char)) {
      units.push(current);
      current = "";
    }
  }

  if (current.length > 0) {
    units.push(current);
  }

  return units.length > 0 ? units : [text];
}

function getSentenceUnitOffsetLength(unit: string): number {
  return Buffer.byteLength(unit, "utf8");
}

function skipKnownFlagValue(argv: string[], index: number, knownFlags: ReadonlySet<string>): number {
  const arg = argv[index];
  if (!arg || !arg.startsWith("--")) {
    return index;
  }

  const flagBody = arg.slice(2);
  const separatorIndex = flagBody.indexOf("=");
  const flagName = separatorIndex === -1 ? flagBody : flagBody.slice(0, separatorIndex);
  if (!knownFlags.has(flagName) || separatorIndex !== -1) {
    return index;
  }

  return index + 1;
}

function discoverCliCommand(argv: string[]): {
  command: CliCommandName;
  helpTarget?: CliHelpTarget;
  error?: SudachiError;
} {
  let command: CliCommandName = "tokenize";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    if (isHelpToken(arg)) {
      return {
        command,
        helpTarget: command === "tokenize" ? "top-level" : command,
      };
    }

    if (arg.startsWith("--")) {
      if (!isKnownFlagToken(arg, KNOWN_FLAGS)) {
        return {
          command: "tokenize",
          error: unknownFlagError(arg.includes("=") ? `--${arg.slice(2, arg.indexOf("="))}` : arg),
          helpTarget: "top-level",
        };
      }

      const flagBody = arg.slice(2);
      const separatorIndex = flagBody.indexOf("=");
      const flagName = separatorIndex === -1 ? flagBody : flagBody.slice(0, separatorIndex);
      if (separatorIndex !== -1 && BOOLEAN_FLAGS.has(flagName)) {
        return {
          command: "tokenize",
          error: invalidBooleanFlagSyntaxError(arg),
          helpTarget: "top-level",
        };
      }
      if (separatorIndex === -1 && BOOLEAN_FLAGS.has(flagName)) {
        const nextToken = argv[index + 1];
        if (nextToken && !nextToken.startsWith("--")) {
          return {
            command: "tokenize",
            error: invalidBooleanFlagSyntaxError(`${arg} ${nextToken}`),
            helpTarget: "top-level",
          };
        }
      }

      index = skipKnownFlagValue(argv, index, KNOWN_VALUE_FLAGS);
      continue;
    }

    if (command !== "tokenize") {
      continue;
    }

    if (!isKnownSubcommand(arg)) {
      return {
        command: "tokenize",
        error: unknownSubcommandError(arg),
        helpTarget: "top-level",
      };
    }

    command = arg;
  }

  return {
    command,
  };
}

export function parseArgValue(
  argv: string[],
  name: string,
  knownFlags: ReadonlySet<string> = KNOWN_FLAGS,
): string | undefined {
  const prefix = `--${name}=`;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    if (arg.startsWith(prefix)) {
      const value = arg.slice(prefix.length);
      if (value.length === 0) {
        throw missingArgumentError(name);
      }
      return value;
    }

    if (arg === `--${name}`) {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw missingArgumentError(name);
      }
      if (isKnownFlagToken(nextValue, knownFlags)) {
        throw missingArgumentError(name);
      }
      return nextValue;
    }
  }

  return undefined;
}

function printUsage(io: Pick<CliIO, "log">, command: CliHelpTarget = "top-level"): void {
  const lines =
    command === "tokenize"
      ? [
          "Usage:",
          "  bun run index.ts --dict-path=/path/to/dictionary --library-path=/path/to/libsudachi_ffi.dylib --text='...' [--wakati|--all] [--split-sentences] [--debug] [--resource-dir <path>|--resource_dir <path>] [--output <path>|-]",
          "",
          "Options:",
          "  --wakati          Output space-joined surfaces.",
          "  --all             Use the explicit all output mode.",
          "  --split-sentences Tokenize input sentence by sentence.",
          "  --debug           Emit debug diagnostics to stderr.",
          "  --resource-dir <path>, --resource_dir <path>",
          "                    Use a custom resource directory.",
          "  --output <path>|- Write to a file, or stdout with -.",
          "",
          "Environment variables:",
          "  SUDACHI_DICT_PATH",
          "  SUDACHI_CONFIG_PATH",
          "  SUDACHI_FFI_PATH",
        ]
      : command === "build"
        ? [
            "Usage:",
            "  bun run index.ts build [--help]",
            "",
            "Status:",
            "  Not implemented yet. TODO delegate to dictionary layer.",
          ]
        : command === "ubuild"
          ? [
              "Usage:",
              "  bun run index.ts ubuild [--help]",
              "",
              "Status:",
              "  Not implemented yet. TODO delegate to dictionary layer.",
            ]
          : command === "dump"
            ? [
                "Usage:",
            "  bun run index.ts dump [--help]",
              "",
              "Status:",
              "  Not implemented yet. TODO delegate to dictionary layer.",
          ]
            : [
            "Usage:",
            "  bun run index.ts [build|ubuild|dump] --dict-path=/path/to/dictionary --library-path=/path/to/libsudachi_ffi.dylib --text='...' [--wakati|--all] [--split-sentences] [--debug] [--resource-dir <path>|--resource_dir <path>] [--output <path>|-]",
            "",
            "Commands:",
            "  build   Build a dictionary.",
            "  ubuild  Build an Uber dictionary.",
            "  dump    Dump dictionary contents.",
            "",
            "Use `--help` or `-h` after a command for command-specific help.",
            "Tokenize options:",
            "  --wakati, --all, --split-sentences, --debug, --resource-dir <path>, --resource_dir <path>, --output <path>|-",
            "",
            "Environment variables:",
            "  SUDACHI_DICT_PATH",
            "  SUDACHI_DICTIONARY_PATH",
                "  SUDACHI_CONFIG_PATH",
                "  SUDACHI_FFI_PATH",
                "  SUDACHI_FFI_DIR",
              ];

  io.log(lines.join("\n"));
}

export function parseCliArgs(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): TokenizeCliCommand {
  const dictPath =
    parseArgValue(argv, "dict-path", KNOWN_FLAGS) ?? env.SUDACHI_DICT_PATH ?? env.SUDACHI_DICTIONARY_PATH;
  if (!dictPath) {
    throw missingArgumentError("dict-path");
  }

  const resourceDir = validateResourceDir(parseAliasedArgValue(argv, ["resource-dir", "resource_dir"], KNOWN_FLAGS));
  const debug = hasFlag(argv, "debug");

  const command: TokenizeCliCommand = {
    dictPath,
    configPath: parseArgValue(argv, "config-path", KNOWN_FLAGS) ?? env.SUDACHI_CONFIG_PATH,
    libraryPath: parseArgValue(argv, "library-path", KNOWN_FLAGS) ?? env.SUDACHI_FFI_PATH,
    mode: parseTokenizeMode(parseArgValue(argv, "mode", KNOWN_FLAGS) ?? "C"),
    text: parseArgValue(argv, "text", KNOWN_FLAGS) ?? "すもももももももものうち",
  };

  if (resourceDir !== undefined) {
    command.resourceDir = resourceDir;
  }

  if (hasFlag(argv, "split-sentences")) {
    command.splitSentences = true;
  }

  if (debug) {
    command.debug = true;
  }

  return command;
}

function parseTokenizeExecutionCommand(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): TokenizeExecutionCommand {
  const command = parseCliArgs(argv, env);
  const wakati = hasFlag(argv, "wakati");
  const all = hasFlag(argv, "all");
  if (wakati && all) {
    throw new SudachiError("Cannot combine --wakati and --all.", {
      code: "INVALID_ARGUMENT",
    });
  }

  return {
    ...command,
    splitSentences: Boolean(command.splitSentences),
    format: all ? "all" : wakati ? "wakati" : "normal",
    outputPath: parseArgValue(argv, "output", KNOWN_FLAGS),
  };
}

function formatTokenizeOutput(morphemes: Awaited<ReturnType<Tokenizer["tokenize"]>>, format: TokenizeOutputFormat): string {
  switch (format) {
    case "wakati":
      return morphemes.map((morpheme) => morpheme.surface).join(" ");
    case "all":
    case "normal":
      return JSON.stringify(morphemes, null, 2);
  }
}

function tokenizeSentenceUnits(
  tokenizer: Tokenizer,
  text: string,
  mode: TokenizeMode,
  splitSentences: boolean,
): Awaited<ReturnType<Tokenizer["tokenize"]>> {
  if (!splitSentences) {
    return tokenizer.tokenize(text, mode);
  }

  const units = splitTextIntoSentenceUnits(text);
  const morphemes: Awaited<ReturnType<Tokenizer["tokenize"]>> = [];
  let offset = 0;

  for (const unit of units) {
    const unitMorphemes = tokenizer.tokenize(unit, mode);
    if (offset === 0) {
      morphemes.push(...unitMorphemes);
    } else {
      morphemes.push(
        ...unitMorphemes.map((morpheme) => ({
          ...morpheme,
          begin: morpheme.begin + offset,
          end: morpheme.end + offset,
        })),
      );
    }
    offset += getSentenceUnitOffsetLength(unit);
  }

  return morphemes;
}

function writeTokenizeOutput(outputPath: string, output: string): void {
  try {
    writeFileSync(outputPath, output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SudachiError(`Failed to write output to ${outputPath}: ${message}`, {
      code: "INVALID_ARGUMENT",
    });
  }
}

export function runTokenizeCommand(
  command: TokenizeCliCommand,
  format: TokenizeOutputFormat = "normal",
  io?: Pick<CliIO, "error">,
): string {
  const tokenizer = Tokenizer.load(command);

  try {
    if (command.debug) {
      io?.error(
        [
          `[debug] tokenize`,
          `format=${format}`,
          `splitSentences=${command.splitSentences ? "true" : "false"}`,
          `resourceDir=${command.resourceDir ?? "(default)"}`,
        ].join(" "),
      );
    }

    const morphemes = tokenizeSentenceUnits(tokenizer, command.text, command.mode, Boolean(command.splitSentences));

    if (command.debug) {
      io?.error(`[debug] morphemes=${morphemes.length}`);
    }

    return formatTokenizeOutput(morphemes, format);
  } finally {
    tokenizer.close();
  }
}

function runSubcommand(command: CliSubcommand): string {
  throw unimplementedCommandError(command);
}

export function runCli(
  argv = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  io: CliIO = console,
): number {
  const discovery = discoverCliCommand(argv);

  if (discovery.error) {
    io.error(formatSudachiError(discovery.error));
    printUsage(io, discovery.helpTarget);
    return 1;
  }

  if (discovery.helpTarget) {
    printUsage(io, discovery.helpTarget);
    return 0;
  }

  try {
    if (discovery.command === "tokenize") {
      const command = parseTokenizeExecutionCommand(argv, env);
      const output = runTokenizeCommand(command, command.format, io);

      if (command.outputPath && command.outputPath !== "-") {
        writeTokenizeOutput(command.outputPath, output);
      } else {
        io.log(output);
      }
      return 0;
    }

    io.log(runSubcommand(discovery.command));
    return 0;
  } catch (error) {
    io.error(formatSudachiError(error));
    printUsage(io, discovery.command);
    return 1;
  }
}

export function main(argv = process.argv.slice(2)): void {
  process.exit(runCli(argv));
}
