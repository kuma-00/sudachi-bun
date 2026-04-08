import { Tokenizer } from "./core.ts";
import { type TokenizeMode } from "./types.ts";

const KNOWN_FLAGS = new Set([
  "dict-path",
  "config-path",
  "library-path",
  "mode",
  "text",
]);

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
        throw new Error(`Missing value for --${name}`);
      }
      return value;
    }

    if (arg === `--${name}`) {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error(`Missing value for --${name}`);
      }
      if (nextValue.startsWith("--") && knownFlags.has(nextValue.slice(2))) {
        throw new Error(`Missing value for --${name}`);
      }
      return nextValue;
    }
  }

  return undefined;
}

function printUsage(): void {
  console.log(
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

export function main(argv = process.argv.slice(2)): void {
  try {
    const dictPath =
      parseArgValue(argv, "dict-path", KNOWN_FLAGS) ??
      process.env.SUDACHI_DICT_PATH ??
      process.env.SUDACHI_DICTIONARY_PATH;
    const configPath = parseArgValue(argv, "config-path", KNOWN_FLAGS) ?? process.env.SUDACHI_CONFIG_PATH;
    const libraryPath = parseArgValue(argv, "library-path", KNOWN_FLAGS) ?? process.env.SUDACHI_FFI_PATH;
    const mode = (parseArgValue(argv, "mode", KNOWN_FLAGS) ?? "C") as TokenizeMode;
    const text = parseArgValue(argv, "text", KNOWN_FLAGS) ?? "すもももももももものうち";

    if (!dictPath) {
      throw new Error("Missing value for --dict-path");
    }

    if (!["A", "B", "C"].includes(mode)) {
      throw new Error(`Invalid mode: ${mode}`);
    }

    const tokenizer = new Tokenizer({
      dictPath,
      configPath,
      libraryPath,
    });

    try {
      const morphemes = tokenizer.tokenize(text, mode);
      console.log(JSON.stringify(morphemes, null, 2));
    } finally {
      tokenizer.close();
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    printUsage();
    process.exit(1);
  }
}
