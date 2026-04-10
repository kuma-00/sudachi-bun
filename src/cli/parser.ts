import { SudachiError, parseSurfaceProjection, parseTokenizeMode, type TokenizeMode } from "../types.ts";
import {
  CLI_SUBCOMMANDS,
  type CliCommand,
  type CliHelpResult,
  type CliParseErrorResult,
  type CliParseResult,
  type CliSubcommand,
  type CliTokenizeCommand,
} from "./types.ts";

const VALUE_FLAGS = new Set([
  "dict-path",
  "config-path",
  "library-path",
  "resource-dir",
  "projection",
  "mode",
  "text",
  "output",
]);

const BOOLEAN_FLAGS = new Set(["wakati", "all", "split-sentences", "debug"]);

const KNOWN_FLAGS = new Set([...VALUE_FLAGS, ...BOOLEAN_FLAGS]);

function isHelpToken(value: string): boolean {
  return value === "-h" || value === "--help";
}

function isKnownSubcommand(value: string): value is CliSubcommand {
  return CLI_SUBCOMMANDS.includes(value as CliSubcommand);
}

function missingArgumentError(name: string): SudachiError {
  return new SudachiError(`Missing value for --${name}`, {
    code: "MISSING_ARGUMENT",
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

function missingSubcommandError(): SudachiError {
  return new SudachiError("A subcommand is required. Use tokenize, build, ubuild, or dump.", {
    code: "INVALID_ARGUMENT",
  });
}

function invalidSubcommandError(value: string): SudachiError {
  return new SudachiError(`Unknown subcommand: ${value}`, {
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

function hasBooleanFlag(argv: string[], name: string): boolean {
  const prefix = `--${name}`;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token || !token.startsWith(prefix)) {
      continue;
    }

    const nextChar = token.slice(prefix.length, prefix.length + 1);
    if (nextChar === "=") {
      throw invalidBooleanFlagSyntaxError(token);
    }
    if (nextChar.length === 0) {
      return true;
    }

    continue;
  }

  return false;
}

function parseKnownFlagToken(
  argv: string[],
  index: number,
  knownFlags: ReadonlySet<string>,
): {
  name: string;
  value?: string;
  consumed: number;
} {
  const token = argv[index];
  if (!token || !token.startsWith("--")) {
    throw new Error("parseKnownFlagToken requires a flag token.");
  }

  const flagBody = token.slice(2);
  const separatorIndex = flagBody.indexOf("=");
  const name = separatorIndex === -1 ? flagBody : flagBody.slice(0, separatorIndex);

  if (!knownFlags.has(name)) {
    throw unknownFlagError(token);
  }

  if (BOOLEAN_FLAGS.has(name)) {
    if (separatorIndex !== -1) {
      throw invalidBooleanFlagSyntaxError(token);
    }
    return { name, consumed: 1 };
  }

  if (separatorIndex !== -1) {
    const value = token.slice(token.indexOf("=") + 1);
    if (value.length === 0) {
      throw missingArgumentError(name);
    }
    return { name, value, consumed: 1 };
  }

  const nextToken = argv[index + 1];
  if (!nextToken || isHelpToken(nextToken) || isKnownFlagToken(nextToken, knownFlags)) {
    throw missingArgumentError(name);
  }

  return { name, value: nextToken, consumed: 2 };
}

export function parseArgValue(
  argv: string[],
  name: string,
  knownFlags: ReadonlySet<string> = KNOWN_FLAGS,
): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token || !token.startsWith("--")) {
      continue;
    }

    const flagBody = token.slice(2);
    const separatorIndex = flagBody.indexOf("=");
    const flagName = separatorIndex === -1 ? flagBody : flagBody.slice(0, separatorIndex);
    if (flagName !== name) {
      continue;
    }

    if (BOOLEAN_FLAGS.has(name)) {
      if (separatorIndex !== -1) {
        throw invalidBooleanFlagSyntaxError(token);
      }
      return undefined;
    }

    if (separatorIndex !== -1) {
      const value = token.slice(token.indexOf("=") + 1);
      if (value.length === 0) {
        throw missingArgumentError(name);
      }
      return value;
    }

    const nextToken = argv[index + 1];
    if (!nextToken || isHelpToken(nextToken) || isKnownFlagToken(nextToken, knownFlags)) {
      throw missingArgumentError(name);
    }

    return nextToken;
  }

  return undefined;
}

function errorResult(error: SudachiError, helpTarget: CliHelpResult["target"]): CliParseErrorResult {
  return {
    kind: "error",
    error,
    helpTarget,
  };
}

function firstUnsupportedFlag(argv: string[]): string | undefined {
  for (const token of argv) {
    if (token && token.startsWith("--") && !isHelpToken(token)) {
      return token;
    }
  }

  return undefined;
}

function tokenizeCommandFrom(argv: string[], env: NodeJS.ProcessEnv): CliTokenizeCommand | CliParseErrorResult {
  const dictPath =
    parseArgValue(argv, "dict-path", KNOWN_FLAGS) ?? env.SUDACHI_DICT_PATH ?? env.SUDACHI_DICTIONARY_PATH;
  if (!dictPath) {
    return errorResult(missingArgumentError("dict-path"), "tokenize");
  }

  const projectionValue = parseArgValue(argv, "projection", KNOWN_FLAGS);
  if (!projectionValue) {
    return errorResult(missingArgumentError("projection"), "tokenize");
  }

  let projection: CliTokenizeCommand["projection"];
  try {
    projection = parseSurfaceProjection(projectionValue);
  } catch (error) {
    return errorResult(
      error instanceof SudachiError ? error : new SudachiError(String(error), { code: "INVALID_ARGUMENT" }),
      "tokenize",
    );
  }

  const mode = parseArgValue(argv, "mode", KNOWN_FLAGS);
  let parsedMode: TokenizeMode;
  try {
    parsedMode = parseTokenizeMode(mode ?? "C");
  } catch (error) {
    return errorResult(error instanceof SudachiError ? error : new SudachiError(String(error), { code: "INVALID_ARGUMENT" }), "tokenize");
  }

  const command: CliTokenizeCommand = {
    kind: "tokenize",
    dictPath,
    projection,
    configPath: parseArgValue(argv, "config-path", KNOWN_FLAGS) ?? env.SUDACHI_CONFIG_PATH,
    libraryPath: parseArgValue(argv, "library-path", KNOWN_FLAGS) ?? env.SUDACHI_FFI_PATH,
    resourceDir: parseArgValue(argv, "resource-dir", KNOWN_FLAGS),
    mode: parsedMode,
    wakati: hasBooleanFlag(argv, "wakati"),
    all: hasBooleanFlag(argv, "all"),
    splitSentences: hasBooleanFlag(argv, "split-sentences"),
    debug: hasBooleanFlag(argv, "debug"),
    outputPath: parseArgValue(argv, "output", KNOWN_FLAGS),
    text: parseArgValue(argv, "text", KNOWN_FLAGS),
    positionals: [],
  };

  return command;
}

function commandFromSubcommand(command: CliSubcommand): CliCommand {
  if (command === "tokenize") {
    throw new Error("tokenize command requires dedicated parsing");
  }

  return {
    kind: command,
    positionals: [],
  };
}

export function parseCliArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): CliParseResult {
  let command: CliSubcommand | undefined;
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    if (isHelpToken(token)) {
      return {
        kind: "help",
        target: command ?? "top-level",
      };
    }

    if (token.startsWith("--")) {
      if (command && command !== "tokenize") {
        return errorResult(unknownFlagError(token), command);
      }

      try {
        const parsed = parseKnownFlagToken(argv, index, KNOWN_FLAGS);
        index += parsed.consumed - 1;
      } catch (error) {
        return errorResult(error instanceof SudachiError ? error : new SudachiError(String(error), { code: "INVALID_ARGUMENT" }), command ?? "top-level");
      }
      continue;
    }

    if (!command) {
      if (!isKnownSubcommand(token)) {
        return errorResult(invalidSubcommandError(token), "top-level");
      }
      command = token;
      continue;
    }

    positionals.push(token);
  }

  if (!command) {
    return errorResult(missingSubcommandError(), "top-level");
  }

  if (command === "tokenize") {
    const parsed = tokenizeCommandFrom(argv, env);
    if (parsed.kind === "error") {
      return parsed;
    }
    return {
      kind: "command",
      command: {
        ...parsed,
        positionals: [...positionals],
      },
    };
  }

  const unsupportedFlag = firstUnsupportedFlag(argv);
  if (unsupportedFlag) {
    return errorResult(unknownFlagError(unsupportedFlag), command);
  }

  return {
    kind: "command",
    command: {
      ...commandFromSubcommand(command),
      positionals,
    },
  };
}
