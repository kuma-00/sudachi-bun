import { expect, test } from "bun:test";

import { SudachiError } from "../types.ts";
import { type InputResolutionDependencies, resolveInputText } from "./input.ts";

function createDeps(overrides: Partial<InputResolutionDependencies> = {}) {
  const fileReads: string[] = [];
  let stdinChecks = 0;
  let stdinReads = 0;
  const isStdinPipedImpl = overrides.isStdinPiped ?? (() => false);
  const readStdinTextImpl = overrides.readStdinText ?? (() => "stdin");
  const readFileTextImpl = overrides.readFileText ?? ((path: string) => path);

  const deps: InputResolutionDependencies = {
    isStdinPiped: () => {
      stdinChecks += 1;
      return isStdinPipedImpl();
    },
    readStdinText: () => {
      stdinReads += 1;
      return readStdinTextImpl();
    },
    readFileText: (path: string) => {
      fileReads.push(path);
      return readFileTextImpl(path);
    },
  };

  return {
    deps,
    state: {
      fileReads,
      get stdinChecks() {
        return stdinChecks;
      },
      get stdinReads() {
        return stdinReads;
      },
    },
  };
}

function expectInvalidArgumentError(
  callback: () => string,
  message: string,
): void {
  try {
    callback();
    throw new Error("Expected resolveInputText to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(SudachiError);
    expect((error as SudachiError).code).toBe("INVALID_ARGUMENT");
    expect((error as Error).message).toBe(message);
  }
}

test("resolveInputText returns explicit text when it is the only source", () => {
  const { deps, state } = createDeps();

  expect(resolveInputText({ text: "explicit text" }, deps)).toBe(
    "explicit text",
  );
  expect(state.fileReads).toEqual([]);
  expect(state.stdinChecks).toBe(1);
  expect(state.stdinReads).toBe(0);
});

test("resolveInputText rejects combining --text with positional files", () => {
  const { deps, state } = createDeps();

  expectInvalidArgumentError(
    () =>
      resolveInputText(
        { text: "explicit text", positionalFiles: ["input.txt"] },
        deps,
      ),
    "Cannot combine --text with positional file input.",
  );
  expect(state.fileReads).toEqual([]);
  expect(state.stdinChecks).toBe(0);
  expect(state.stdinReads).toBe(0);
});

test("resolveInputText rejects combining --text with stdin", () => {
  const { deps, state } = createDeps({
    isStdinPiped: () => true,
    readStdinText: () => "stdin text",
  });

  expectInvalidArgumentError(
    () => resolveInputText({ text: "explicit text" }, deps),
    "Cannot combine --text with stdin input.",
  );
  expect(state.fileReads).toEqual([]);
  expect(state.stdinChecks).toBe(1);
  expect(state.stdinReads).toBe(1);
});

test("resolveInputText rejects combining positional files with stdin", () => {
  const { deps, state } = createDeps({
    isStdinPiped: () => true,
    readStdinText: () => "stdin text",
  });

  expectInvalidArgumentError(
    () => resolveInputText({ positionalFiles: ["input-a.txt"] }, deps),
    "Cannot combine positional file input with stdin input.",
  );
  expect(state.fileReads).toEqual([]);
  expect(state.stdinChecks).toBe(1);
  expect(state.stdinReads).toBe(1);
});

test("resolveInputText accepts --text when piped stdin is empty", () => {
  const { deps, state } = createDeps({
    isStdinPiped: () => true,
    readStdinText: () => "",
  });

  expect(resolveInputText({ text: "explicit text" }, deps)).toBe(
    "explicit text",
  );
  expect(state.fileReads).toEqual([]);
  expect(state.stdinChecks).toBe(1);
  expect(state.stdinReads).toBe(1);
});

test("resolveInputText accepts positional files when piped stdin is empty", () => {
  const { deps, state } = createDeps({
    isStdinPiped: () => true,
    readStdinText: () => "",
    readFileText: () => "file input",
  });

  expect(resolveInputText({ positionalFiles: ["input.txt"] }, deps)).toBe(
    "file input",
  );
  expect(state.fileReads).toEqual(["input.txt"]);
  expect(state.stdinChecks).toBe(1);
  expect(state.stdinReads).toBe(1);
});

test("resolveInputText concatenates multiple positional files with newlines", () => {
  const { deps, state } = createDeps({
    readFileText: (path: string) => {
      if (path === "first.txt") {
        return "first";
      }

      if (path === "second.txt") {
        return "second";
      }

      throw new Error(`unexpected file: ${path}`);
    },
  });

  expect(
    resolveInputText({ positionalFiles: ["first.txt", "second.txt"] }, deps),
  ).toBe("first\nsecond");
  expect(state.fileReads).toEqual(["first.txt", "second.txt"]);
  expect(state.stdinChecks).toBe(1);
  expect(state.stdinReads).toBe(0);
});

test("resolveInputText reads stdin when it is the only input source", () => {
  const { deps, state } = createDeps({
    isStdinPiped: () => true,
    readStdinText: () => "stdin text",
  });

  expect(resolveInputText({}, deps)).toBe("stdin text");
  expect(state.fileReads).toEqual([]);
  expect(state.stdinChecks).toBe(1);
  expect(state.stdinReads).toBe(1);
});

test("resolveInputText normalizes stdin read failures", () => {
  const { deps, state } = createDeps({
    isStdinPiped: () => true,
    readStdinText: () => {
      throw new Error("boom");
    },
  });

  expectInvalidArgumentError(
    () => resolveInputText({}, deps),
    "Failed to read stdin: boom",
  );
  expect(state.fileReads).toEqual([]);
  expect(state.stdinChecks).toBe(1);
  expect(state.stdinReads).toBe(1);
});

test("resolveInputText rejects missing input when stdin is not piped", () => {
  const { deps, state } = createDeps({
    isStdinPiped: () => false,
  });

  expectInvalidArgumentError(
    () => resolveInputText({}, deps),
    "No input was resolved from --text, positional file paths, or stdin.",
  );
  expect(state.fileReads).toEqual([]);
  expect(state.stdinChecks).toBe(1);
  expect(state.stdinReads).toBe(0);
});

test("resolveInputText rejects empty file input", () => {
  const { deps, state } = createDeps({
    readFileText: () => "",
  });

  expectInvalidArgumentError(
    () => resolveInputText({ positionalFiles: ["empty.txt"] }, deps),
    "No input was resolved from --text, positional file paths, or stdin.",
  );
  expect(state.fileReads).toEqual(["empty.txt"]);
  expect(state.stdinChecks).toBe(1);
  expect(state.stdinReads).toBe(0);
});

test("resolveInputText rejects empty stdin input", () => {
  const { deps, state } = createDeps({
    isStdinPiped: () => true,
    readStdinText: () => "",
  });

  expectInvalidArgumentError(
    () => resolveInputText({}, deps),
    "No input was resolved from --text, positional file paths, or stdin.",
  );
  expect(state.fileReads).toEqual([]);
  expect(state.stdinChecks).toBe(1);
  expect(state.stdinReads).toBe(1);
});
