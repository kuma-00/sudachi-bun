import { mkdir } from "node:fs/promises";

export type DictionaryType = "core" | "small" | "full";

export type SetupDictionaryOptions = {
  type: DictionaryType;
  version: string;
  outDir: string;
  url?: string;
};

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type ReleaseMetadata = {
  tag_name: string;
  assets: ReleaseAsset[];
  html_url?: string;
};

type DictionaryDownload = {
  name: string;
  url: string;
};

const GITHUB_RELEASES_API = "https://api.github.com/repos/WorksApplications/SudachiDict/releases";
const DEFAULT_VERSION = "latest";
const DEFAULT_OUT_DIR = "./dict";
const VALID_TYPES: DictionaryType[] = ["core", "small", "full"];

function printHelp(): void {
  console.log(`Usage:
  bun run setup:dict -- [--type core|small|full] [--version <version>] [--out <dir>] [--url <url>]

Examples:
  bun run setup:dict -- --type core --version latest --out ./dict
  bun run setup:dict -- --type full --version v20240416
  bun run setup:dict -- --url https://example.com/sudachi-dictionary.zip --out ./dict
`);
}

function readOptionValue(argv: string[], index: number, flag: string): { value: string; nextIndex: number } {
  const arg = argv[index];
  if (!arg) {
    throw new Error(`Missing value for ${flag}`);
  }

  const [rawFlag, inlineValue] = arg.includes("=") ? arg.split(/=(.*)/s, 2) : [arg, undefined];
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

  throw new Error(`Unsupported dictionary type: ${input}. Expected one of: ${VALID_TYPES.join(", ")}`);
}

export function parseSetupDictionaryArgs(argv: string[]): SetupDictionaryOptions {
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

export function buildReleaseApiUrl(version: string): string {
  if (version === DEFAULT_VERSION) {
    return `${GITHUB_RELEASES_API}/latest`;
  }

  return `${GITHUB_RELEASES_API}/tags/${encodeURIComponent(version)}`;
}

export function buildExpectedAssetName(type: DictionaryType, releaseTag: string): string {
  const versionPart = releaseTag.replace(/^v/, "");
  return `sudachi-dictionary-${versionPart}-${type}.zip`;
}

export function resolveDictionaryAsset(release: ReleaseMetadata, type: DictionaryType): ReleaseAsset {
  const expectedName = buildExpectedAssetName(type, release.tag_name);
  const match = release.assets.find((asset) => asset.name === expectedName);
  if (match) {
    return match;
  }

  const available = release.assets.map((asset) => asset.name).join(", ");
  throw new Error(
    [
      `Could not find dictionary asset for type "${type}" in release ${release.tag_name}.`,
      `Expected: ${expectedName}`,
      available ? `Available: ${available}` : "Available: (none)",
      release.html_url ? `Release: ${release.html_url}` : undefined,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n"),
  );
}

async function fetchReleaseMetadata(version: string): Promise<ReleaseMetadata> {
  const url = buildReleaseApiUrl(version);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
      },
    });
  } catch (error) {
    throw new Error(
      `Failed to fetch SudachiDict release metadata from ${url}.\n` +
        `If you are offline, retry with --url pointing to a local mirror.\n` +
        `Original error: ${(error as Error).message}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `SudachiDict release metadata request failed for ${url} with HTTP ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as ReleaseMetadata;
}

function normalizeOutDir(outDir: string): string {
  return outDir.replace(/\/$/, "");
}

export async function resolveDictionaryDownload(
  options: SetupDictionaryOptions,
): Promise<DictionaryDownload> {
  if (options.url) {
    return {
      name: options.url.split("/").pop() ?? `sudachi-dictionary-${options.type}.zip`,
      url: options.url,
    };
  }

  const release = await fetchReleaseMetadata(options.version);
  const asset = resolveDictionaryAsset(release, options.type);
  return {
    name: asset.name,
    url: asset.browser_download_url,
  };
}

async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function downloadArchive(url: string, archivePath: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(
      `Failed to fetch dictionary from ${url}.\n` +
        `If you are offline, connect to the network or pass --url to a local mirror.\n` +
        `Original error: ${(error as Error).message}`,
    );
  }

  if (!response.ok) {
    throw new Error(`Dictionary download failed from ${url} with HTTP ${response.status} ${response.statusText}`);
  }

  const body = await response.arrayBuffer();
  await Bun.write(archivePath, body);
}

export async function unzipArchive(archivePath: string, outDir: string): Promise<void> {
  const unzip = Bun.spawn(["unzip", "-o", archivePath, "-d", outDir], {
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await unzip.exited;
  if (exitCode !== 0) {
    throw new Error(
      `Failed to extract ${archivePath} into ${outDir}. Ensure the ` +
        `"unzip" command is installed, or extract the archive manually.`,
    );
  }
}

export async function setupDictionary(options: SetupDictionaryOptions): Promise<void> {
  const outDir = normalizeOutDir(options.outDir);
  const download = await resolveDictionaryDownload(options);
  const archivePath = `${outDir}/${download.name}`;

  await ensureDirectory(outDir);

  console.log("Downloading dictionary");
  console.log(`  type: ${options.type}`);
  console.log(`  version: ${options.version}`);
  console.log(`  url: ${download.url}`);
  console.log(`  out: ${outDir}`);

  await downloadArchive(download.url, archivePath);
  await unzipArchive(archivePath, outDir);

  console.log(`Dictionary setup complete: ${outDir}`);
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  await setupDictionary(parseSetupDictionaryArgs(argv));
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
