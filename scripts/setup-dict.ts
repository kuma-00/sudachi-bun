import { mkdir } from "node:fs/promises";

export type DictionaryType = "core" | "small" | "full";

type Options = {
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

function parseArgs(argv: string[]): Options {
  const parsed: Partial<Options> = {
    type: "core",
    version: DEFAULT_VERSION,
    outDir: DEFAULT_OUT_DIR,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;

    if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    }

    const [flag, inlineValue] = arg.includes("=") ? arg.split(/=(.*)/s, 2) : [arg, undefined];
    const nextValue = inlineValue ?? argv[i + 1];
    const hasNextValue = inlineValue === undefined && nextValue !== undefined && !nextValue.startsWith("-");

    switch (flag) {
      case "--type":
        if (!hasNextValue && inlineValue === undefined) {
          throw new Error("Missing value for --type");
        }
        parsed.type = normalizeType(nextValue ?? inlineValue);
        if (inlineValue === undefined) i += 1;
        break;
      case "--version":
        if (!hasNextValue && inlineValue === undefined) {
          throw new Error("Missing value for --version");
        }
        parsed.version = nextValue ?? inlineValue ?? DEFAULT_VERSION;
        if (inlineValue === undefined) i += 1;
        break;
      case "--out":
        if (!hasNextValue && inlineValue === undefined) {
          throw new Error("Missing value for --out");
        }
        parsed.outDir = nextValue ?? inlineValue ?? DEFAULT_OUT_DIR;
        if (inlineValue === undefined) i += 1;
        break;
      case "--url":
        if (!hasNextValue && inlineValue === undefined) {
          throw new Error("Missing value for --url");
        }
        parsed.url = nextValue ?? inlineValue;
        if (inlineValue === undefined) i += 1;
        break;
      default:
        if (flag.startsWith("--type=")) {
          parsed.type = normalizeType(flag.slice("--type=".length));
        } else if (flag.startsWith("--version=")) {
          parsed.version = flag.slice("--version=".length);
        } else if (flag.startsWith("--out=")) {
          parsed.outDir = flag.slice("--out=".length);
        } else if (flag.startsWith("--url=")) {
          parsed.url = flag.slice("--url=".length);
        } else {
          throw new Error(`Unknown argument: ${arg}`);
        }
    }
  }

  return {
    type: parsed.type ?? "core",
    version: parsed.version ?? DEFAULT_VERSION,
    outDir: parsed.outDir ?? DEFAULT_OUT_DIR,
    url: parsed.url,
  };
}

function normalizeType(input: string | undefined): DictionaryType {
  if (!input) {
    throw new Error("Missing value for --type");
  }
  if (VALID_TYPES.includes(input as DictionaryType)) {
    return input as DictionaryType;
  }
  throw new Error(`Unsupported dictionary type: ${input}. Expected one of: ${VALID_TYPES.join(", ")}`);
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

export function resolveDictionaryAsset(
  release: ReleaseMetadata,
  type: DictionaryType,
): ReleaseAsset {
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

async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function downloadArchive(url: string, archivePath: string): Promise<void> {
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

async function unzipArchive(archivePath: string, outDir: string): Promise<void> {
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

export async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const outDir = options.outDir.replace(/\/$/, "");
  const resolvedAsset = options.url
    ? { name: options.url.split("/").pop() ?? `sudachi-dictionary-${options.type}.zip`, browser_download_url: options.url }
    : resolveDictionaryAsset(await fetchReleaseMetadata(options.version), options.type);
  const archivePath = `${outDir}/${resolvedAsset.name}`;

  await ensureDirectory(outDir);

  console.log(`Downloading dictionary`);
  console.log(`  type: ${options.type}`);
  console.log(`  version: ${options.version}`);
  console.log(`  url: ${resolvedAsset.browser_download_url}`);
  console.log(`  out: ${outDir}`);

  await downloadArchive(resolvedAsset.browser_download_url, archivePath);
  await unzipArchive(archivePath, outDir);

  console.log(`Dictionary setup complete: ${outDir}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
