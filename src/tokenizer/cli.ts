import { Tokenizer } from "./core.ts";
import {
  formatSudachiError,
  parseTokenizeMode,
  SudachiError,
  type TokenizeMode,
  type TokenizerLoadOptions,
} from "./types.ts";

const KNOWN_FLAGS = new Set([
  "dict-path",
  "config-path",
  "library-path",
  "mode",
  "text",
]);

export interface TokenizeCliCommand extends TokenizerLoadOptions {
  mode: TokenizeMode;
  text: string;
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

function isKnownFlagToken(value: string, knownFlags: ReadonlySet<string>): boolean {
  if (!value.startsWith("--")) {
    return false;
  }

  const flagBody = value.slice(2);
  const separatorIndex = flagBody.indexOf("=");
  const flagName = separatorIndex === -1 ? flagBody : flagBody.slice(0, separatorIndex);
  return knownFlags.has(flagName);
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

function printUsage(io: Pick<CliIO, "log">): void {
  io.log(
    [
      "Usage:",
      "  bun run index.ts --dict-path=/path/to/dictionary --library-path=/path/to/libsudachi_ffi.dylib --text='...'",
      "",
      "Environment variables:",
      "  SUDACHI_DICT_PATH",
      "  SUDACHI_CONFIG_PATH",
      "  SUDACHI_FFI_PATH",
    ].join("\n"),
  );
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

export function runTokenizeCommand(command: TokenizeCliCommand): string {
  const tokenizer = Tokenizer.load(command);

  try {
    return JSON.stringify(tokenizer.tokenize(command.text, command.mode), null, 2);
  } finally {
    tokenizer.close();
  }
}

export function runCli(
  argv = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  io: CliIO = console,
): number {
  try {
    const command = parseCliArgs(argv, env);
    io.log(runTokenizeCommand(command));
    return 0;
  } catch (error) {
    io.error(formatSudachiError(error));
    printUsage(io);
    return 1;
  }
}

export function main(argv = process.argv.slice(2)): void {
  process.exit(runCli(argv));
}
