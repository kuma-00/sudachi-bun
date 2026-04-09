import { writeFileSync } from "node:fs";

import { renderCliHelp } from "./cli/help.ts";
import { type TokenizeOutputFormat } from "./cli/output.ts";
import { normalizeTokenizeCommand } from "./cli/normalize.ts";
import { runTokenizeCommand } from "./cli/execute.ts";
import { parseCliArgs } from "./cli/parser.ts";
import type { CliSubcommand } from "./cli/types.ts";
import { formatSudachiError, SudachiError } from "./types.ts";

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

function writeTokenizeOutput(outputPath: string, output: string): void {
  try {
    writeFileSync(outputPath, output);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw invalidArgumentError(`Failed to write output to ${outputPath}: ${message}`);
  }
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
