import type { SudachiError, SurfaceProjection, TokenizeMode, TokenizerOptions } from "../types.ts";

export const CLI_SUBCOMMANDS = ["tokenize", "build", "ubuild", "dump"] as const;

export type CliSubcommand = (typeof CLI_SUBCOMMANDS)[number];

export type CliHelpTarget = "top-level" | CliSubcommand;

export interface CliHelpResult {
  kind: "help";
  target: CliHelpTarget;
}

export interface CliParseErrorResult {
  kind: "error";
  error: SudachiError;
  helpTarget: CliHelpTarget;
}

export interface CliTokenizeCommand extends TokenizerOptions {
  kind: "tokenize";
  projection: SurfaceProjection;
  mode: TokenizeMode;
  text?: string;
  wakati: boolean;
  all: boolean;
  splitSentences: boolean;
  debug: boolean;
  outputPath?: string;
  positionals: string[];
}

export interface CliOtherCommand {
  kind: Exclude<CliSubcommand, "tokenize">;
  positionals: string[];
}

export type CliCommand = CliTokenizeCommand | CliOtherCommand;

export interface CliCommandResult {
  kind: "command";
  command: CliCommand;
}

export type CliParseResult = CliHelpResult | CliParseErrorResult | CliCommandResult;
