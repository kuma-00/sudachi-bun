import { writeFileSync } from "node:fs";

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
  "mode",
  "text",
  "output",
]);

const BOOLEAN_FLAGS = new Set(["wakati"]);

const KNOWN_FLAGS = new Set([...KNOWN_VALUE_FLAGS, "wakati"]);

const CLI_SUBCOMMANDS = ["build", "ubuild", "dump"] as const;
type CliSubcommand = (typeof CLI_SUBCOMMANDS)[number];
type CliCommandName = "tokenize" | CliSubcommand;
type CliHelpTarget = "top-level" | CliCommandName;
type TokenizeOutputFormat = "normal" | "wakati";

export interface TokenizeCliCommand extends TokenizerLoadOptions {
  mode: TokenizeMode;
  text: string;
}

interface TokenizeExecutionCommand extends TokenizeCliCommand {
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
          "  bun run index.ts --dict-path=/path/to/dictionary --library-path=/path/to/libsudachi_ffi.dylib --text='...' [--wakati] [--output <path>|-]",
          "",
          "Options:",
          "  --wakati          Output space-joined surfaces.",
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
                "  bun run index.ts [build|ubuild|dump] --dict-path=/path/to/dictionary --library-path=/path/to/libsudachi_ffi.dylib --text='...' [--wakati] [--output <path>|-]",
                "",
                "Commands:",
                "  build   Build a dictionary.",
                "  ubuild  Build an Uber dictionary.",
                "  dump    Dump dictionary contents.",
                "",
                "Use `--help` or `-h` after a command for command-specific help.",
                "Tokenize options:",
                "  --wakati, --output <path>|-",
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

  return {
    dictPath,
    configPath: parseArgValue(argv, "config-path", KNOWN_FLAGS) ?? env.SUDACHI_CONFIG_PATH,
    libraryPath: parseArgValue(argv, "library-path", KNOWN_FLAGS) ?? env.SUDACHI_FFI_PATH,
    mode: parseTokenizeMode(parseArgValue(argv, "mode", KNOWN_FLAGS) ?? "C"),
    text: parseArgValue(argv, "text", KNOWN_FLAGS) ?? "すもももももももものうち",
  };
}

function parseTokenizeExecutionCommand(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): TokenizeExecutionCommand {
  const command = parseCliArgs(argv, env);
  const wakati = hasFlag(argv, "wakati");

  return {
    ...command,
    format: wakati ? "wakati" : "normal",
    outputPath: parseArgValue(argv, "output", KNOWN_FLAGS),
  };
}

function formatTokenizeOutput(morphemes: Awaited<ReturnType<Tokenizer["tokenize"]>>, format: TokenizeOutputFormat): string {
  switch (format) {
    case "wakati":
      return morphemes.map((morpheme) => morpheme.surface).join(" ");
    case "normal":
      return JSON.stringify(morphemes, null, 2);
  }
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

export function runTokenizeCommand(command: TokenizeCliCommand, format: TokenizeOutputFormat = "normal"): string {
  const tokenizer = Tokenizer.load(command);

  try {
    return formatTokenizeOutput(tokenizer.tokenize(command.text, command.mode), format);
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
      const output = runTokenizeCommand(command, command.format);

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
