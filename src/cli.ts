import { statSync, writeFileSync } from "node:fs";

import { Tokenizer } from "./core.ts";
import { renderCliHelp } from "./cli/help.ts";
import { resolveInputText } from "./cli/input.ts";
import { parseCliArgs } from "./cli/parser.ts";
import type { CliSubcommand, CliTokenizeCommand } from "./cli/types.ts";
import {
  formatSudachiError,
  SudachiError,
  type Morpheme,
  type TokenizeMode,
  type TokenizerLoadOptions,
} from "./types.ts";

export type TokenizeOutputFormat = "normal" | "wakati" | "all";

export interface TokenizeCliCommand extends TokenizerLoadOptions {
  mode: TokenizeMode;
  text: string;
  splitSentences?: boolean;
  debug?: boolean;
}

interface CliIO {
  log(message: string): void;
  error(message: string): void;
}

function invalidArgumentError(message: string): SudachiError {
  return new SudachiError(message, {
    code: "INVALID_ARGUMENT",
  });
}

function unimplementedCommandError(name: Exclude<CliSubcommand, "tokenize">): SudachiError {
  return invalidArgumentError(`The ${name} command is not implemented yet. TODO delegate to dictionary layer.`);
}

function invalidResourceDirError(value: string): SudachiError {
  return invalidArgumentError(`Invalid resource directory: ${value}`);
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

function formatTokenizeOutput(morphemes: Morpheme[], format: TokenizeOutputFormat): string {
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
): Morpheme[] {
  if (!splitSentences) {
    return tokenizer.tokenize(text, mode);
  }

  const units = splitTextIntoSentenceUnits(text);
  const morphemes: Morpheme[] = [];
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

function writeTokenizeOutput(outputPath: string, output: string): void {
  try {
    writeFileSync(outputPath, output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw invalidArgumentError(`Failed to write output to ${outputPath}: ${message}`);
  }
}

function normalizeTokenizeCommand(parsed: CliTokenizeCommand): TokenizeCliCommand {
  if (parsed.wakati && parsed.all) {
    throw invalidArgumentError("Cannot combine --wakati and --all.");
  }

  const text = resolveInputText({
    text: parsed.text,
    positionalFiles: parsed.positionals,
  });

  return {
    dictPath: parsed.dictPath,
    configPath: parsed.configPath,
    libraryPath: parsed.libraryPath,
    resourceDir: validateResourceDir(parsed.resourceDir),
    mode: parsed.mode,
    text,
    splitSentences: parsed.splitSentences,
    debug: parsed.debug,
  };
}

function runSubcommand(command: Exclude<CliSubcommand, "tokenize">): string {
  throw unimplementedCommandError(command);
}

export function runCli(
  argv = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  io: CliIO = console,
): number {
  const parsed = parseCliArgs(argv, env);

  if (parsed.kind === "help") {
    io.log(renderCliHelp(parsed.target));
    return 0;
  }

  if (parsed.kind === "error") {
    io.error(formatSudachiError(parsed.error));
    io.log(renderCliHelp(parsed.helpTarget));
    return 1;
  }

  try {
    if (parsed.command.kind === "tokenize") {
      const command = normalizeTokenizeCommand(parsed.command);
      const format: TokenizeOutputFormat = parsed.command.all ? "all" : parsed.command.wakati ? "wakati" : "normal";
      const output = runTokenizeCommand(command, format, io);

      if (parsed.command.outputPath && parsed.command.outputPath !== "-") {
        writeTokenizeOutput(parsed.command.outputPath, output);
      } else {
        io.log(output);
      }

      return 0;
    }

    io.log(runSubcommand(parsed.command.kind));
    return 0;
  } catch (error) {
    io.error(formatSudachiError(error));
    io.log(renderCliHelp(parsed.command.kind));
    return 1;
  }
}

export function main(argv = process.argv.slice(2)): void {
  process.exit(runCli(argv));
}
