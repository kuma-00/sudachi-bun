import {
  type DictionarySetupResult,
  type DictionaryType,
  type SetupDictionaryOptions,
  setupDictionary,
} from "../src/dictionary.ts";

const DEFAULT_VERSION = "latest";
const DEFAULT_OUT_DIR = "./dict";
const VALID_TYPES: DictionaryType[] = ["core", "small", "full"];

function printHelp(): void {
  console.log(`Usage:
  bun run setup:dict -- [--type core|small|full] [--version <YYYYMMDD|vYYYYMMDD|latest>] [--out <dir>] [--url <url>]

Examples:
  bun run setup:dict -- --type core --version latest --out ./dict
  bun run setup:dict -- --type full --version v20240416
  bun run setup:dict -- --url https://example.com/sudachidict_core-20260723-py3-none-any.whl --out ./dict

  --url accepts a SudachiDict wheel or a legacy ZIP archive. Source tar.gz files do not contain the dictionary.
  Custom archives whose filename and contents do not expose a numeric version require a numeric --version.
`);
}

function readOptionValue(
  argv: string[],
  index: number,
  flag: string,
): { value: string; nextIndex: number } {
  const arg = argv[index];
  if (!arg) {
    throw new Error(`Missing value for ${flag}`);
  }

  const [rawFlag, inlineValue] = arg.includes("=")
    ? arg.split(/=(.*)/s, 2)
    : [arg, undefined];
  if (rawFlag !== flag) {
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (inlineValue !== undefined) {
    if (inlineValue.length === 0) {
      throw new Error(`Missing value for ${flag}`);
    }

    return { value: inlineValue, nextIndex: index };
  }

  const nextValue = argv[index + 1];
  if (!nextValue || nextValue.startsWith("-")) {
    throw new Error(`Missing value for ${flag}`);
  }

  return { value: nextValue, nextIndex: index + 1 };
}

function normalizeType(input: string): DictionaryType {
  if (VALID_TYPES.includes(input as DictionaryType)) {
    return input as DictionaryType;
  }

  throw new Error(
    `Unsupported dictionary type: ${input}. Expected one of: ${VALID_TYPES.join(", ")}`,
  );
}

export function parseSetupDictionaryArgs(
  argv: string[],
): SetupDictionaryOptions {
  const parsed: SetupDictionaryOptions = {
    type: "core",
    version: DEFAULT_VERSION,
    outDir: DEFAULT_OUT_DIR,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--type" || arg.startsWith("--type=")) {
      const result = readOptionValue(argv, index, "--type");
      parsed.type = normalizeType(result.value);
      index = result.nextIndex;
      continue;
    }

    if (arg === "--version" || arg.startsWith("--version=")) {
      const result = readOptionValue(argv, index, "--version");
      parsed.version = result.value;
      index = result.nextIndex;
      continue;
    }

    if (arg === "--out" || arg.startsWith("--out=")) {
      const result = readOptionValue(argv, index, "--out");
      parsed.outDir = result.value;
      index = result.nextIndex;
      continue;
    }

    if (arg === "--url" || arg.startsWith("--url=")) {
      const result = readOptionValue(argv, index, "--url");
      parsed.url = result.value;
      index = result.nextIndex;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

export function formatSetupDictionaryResult(
  result: DictionarySetupResult,
): string {
  return [
    "Resolved dictionary paths:",
    `  version: ${result.version}`,
    `  dictPath: ${result.dictPath}`,
    `  resourceDir: ${result.resourceDir}`,
    `  defaultConfigPath: ${result.defaultConfigPath}`,
  ].join("\n");
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const result = await setupDictionary(parseSetupDictionaryArgs(argv));
  console.log(formatSetupDictionaryResult(result));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
