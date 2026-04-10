import { statSync } from "node:fs";

import { resolveInputText } from "./input.ts";
import type { CliTokenizeCommand } from "./types.ts";
import {
  SudachiError,
  parseSurfaceProjection,
  type SurfaceProjection,
  type TokenizeMode,
  type TokenizerOptions,
} from "../types.ts";

export interface TokenizeCliCommand extends TokenizerOptions {
  projection: SurfaceProjection;
  mode: TokenizeMode;
  text: string;
  splitSentences?: boolean;
  debug?: boolean;
}

function invalidArgumentError(message: string): SudachiError {
  return new SudachiError(message, {
    code: "INVALID_ARGUMENT",
  });
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

export function normalizeTokenizeCommand(parsed: CliTokenizeCommand): TokenizeCliCommand {
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
    projection: parseSurfaceProjection(parsed.projection),
    mode: parsed.mode,
    text,
    splitSentences: parsed.splitSentences,
    debug: parsed.debug,
  };
}
