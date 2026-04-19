import { fstatSync, readFileSync } from "node:fs";

import { SudachiError } from "../types.ts";

export interface InputResolutionOptions {
  text?: string;
  positionalFiles?: readonly string[];
}

export interface InputResolutionDependencies {
  isStdinPiped?: () => boolean;
  readStdinText?: () => string;
  readFileText?: (path: string) => string;
}

const NO_INPUT_MESSAGE =
  "No input was resolved from --text, positional file paths, or stdin.";

function invalidInputError(message: string): SudachiError {
  return new SudachiError(message, {
    code: "INVALID_ARGUMENT",
  });
}

function hasStdinInput(deps: InputResolutionDependencies): boolean {
  if (deps.isStdinPiped) {
    return deps.isStdinPiped();
  }

  if (process.stdin.isTTY === true) {
    return false;
  }

  if (process.stdin.isTTY === false) {
    return true;
  }

  try {
    return !fstatSync(0).isCharacterDevice();
  } catch {
    return false;
  }
}

function readStdinText(deps: InputResolutionDependencies): string {
  if (deps.readStdinText) {
    return deps.readStdinText();
  }

  return readFileSync(0, "utf8");
}

function readPipedStdinText(
  deps: InputResolutionDependencies,
): string | undefined {
  if (!hasStdinInput(deps)) {
    return undefined;
  }

  try {
    return readStdinText(deps);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw invalidInputError(`Failed to read stdin: ${message}`);
  }
}

function readInputFile(
  path: string,
  deps: InputResolutionDependencies,
): string {
  if (deps.readFileText) {
    return deps.readFileText(path);
  }

  return readFileSync(path, "utf8");
}

function readPositionalFiles(
  positionalFiles: readonly string[],
  deps: InputResolutionDependencies,
): string {
  const contents: string[] = [];

  for (const path of positionalFiles) {
    try {
      contents.push(readInputFile(path, deps));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw invalidInputError(`Failed to read input file ${path}: ${message}`);
    }
  }

  return contents.join("\n");
}

function noInputError(): SudachiError {
  return invalidInputError(NO_INPUT_MESSAGE);
}

export function resolveInputText(
  options: InputResolutionOptions,
  deps: InputResolutionDependencies = {},
): string {
  const positionalFiles = options.positionalFiles ?? [];
  let stdinTextResolved = false;
  let stdinText: string | undefined;
  const getStdinText = (): string | undefined => {
    if (!stdinTextResolved) {
      stdinText = readPipedStdinText(deps);
      stdinTextResolved = true;
    }

    return stdinText;
  };

  if (options.text !== undefined) {
    if (positionalFiles.length > 0) {
      throw invalidInputError(
        "Cannot combine --text with positional file input.",
      );
    }

    const resolvedStdinText = getStdinText();
    if (resolvedStdinText !== undefined && resolvedStdinText.length > 0) {
      throw invalidInputError("Cannot combine --text with stdin input.");
    }

    return options.text;
  }

  if (positionalFiles.length > 0) {
    const resolvedStdinText = getStdinText();
    if (resolvedStdinText !== undefined && resolvedStdinText.length > 0) {
      throw invalidInputError(
        "Cannot combine positional file input with stdin input.",
      );
    }

    const resolvedText = readPositionalFiles(positionalFiles, deps);
    if (resolvedText.length === 0) {
      throw noInputError();
    }

    return resolvedText;
  }

  const resolvedStdinText = getStdinText();
  if (resolvedStdinText !== undefined) {
    if (resolvedStdinText.length === 0) {
      throw noInputError();
    }

    return resolvedStdinText;
  }

  throw noInputError();
}
