import { existsSync, readdirSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

export type DictionaryType = "core" | "small" | "full";

export type SetupDictionaryOptions = {
  type: DictionaryType;
  version: string;
  outDir: string;
  url?: string;
};

export type EnsureDictionaryOptions = SetupDictionaryOptions & {
  forceDownload?: boolean;
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

export type DictionaryDownload = {
  name: string;
  url: string;
  releaseTag?: string;
};

export type InstalledDictionary = {
  type: DictionaryType;
  version: string | null;
  dictPath: string;
  baseDir: string;
};

export type DictionarySetupResult = {
  type: DictionaryType;
  version: string;
  outDir: string;
  archivePath: string;
  extractedDir: string;
  dictPath: string;
  downloaded: boolean;
  sourceUrl: string;
};

const GITHUB_RELEASES_API =
  "https://api.github.com/repos/WorksApplications/SudachiDict/releases";
const DEFAULT_VERSION = "latest";
const GENERIC_DICT_FILES = ["system.dic", "system.dic.test"] as const;
const DICT_FILE_BY_TYPE: Record<DictionaryType, string> = {
  core: "system_core.dic",
  small: "system_small.dic",
  full: "system_full.dic",
};

function normalizeOutDir(outDir: string): string {
  return outDir.replace(/\/$/, "");
}

function normalizeVersion(version: string): string {
  return version.replace(/^v/, "");
}

function extractedDirFromVersion(outDir: string, version: string): string {
  return join(outDir, `sudachi-dictionary-${normalizeVersion(version)}`);
}

function toAbsolute(path: string): string {
  return resolve(path);
}

function listDirectorySafe(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

function versionFromDirectoryName(name: string): string | null {
  const match = /^sudachi-dictionary-(\d+)$/.exec(name);
  return match?.[1] ?? null;
}

function compareVersionDescending(
  left: string | null,
  right: string | null,
): number {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }

  try {
    const leftValue = BigInt(left);
    const rightValue = BigInt(right);
    if (leftValue > rightValue) {
      return -1;
    }
    if (leftValue < rightValue) {
      return 1;
    }
    return 0;
  } catch {
    return right.localeCompare(left);
  }
}

function inferReleaseTagFromAssetName(
  assetName: string,
  type: DictionaryType,
): string | undefined {
  const match = new RegExp(`^sudachi-dictionary-(\\d+)-${type}\\.zip$`).exec(
    assetName,
  );
  if (!match?.[1]) {
    return undefined;
  }

  return `v${match[1]}`;
}

function findBestInstalledDictionary(options: {
  type: DictionaryType;
  requestedVersion: string;
  resolvedVersion: string;
  beforeInstall: InstalledDictionary[];
  afterInstall: InstalledDictionary[];
}): InstalledDictionary | null {
  const installed = options.afterInstall.filter(
    (entry) => entry.type === options.type,
  );
  if (installed.length === 0) {
    return null;
  }

  const expectedVersion = normalizeVersion(options.resolvedVersion);
  if (expectedVersion !== DEFAULT_VERSION) {
    const exact = installed.find((entry) => entry.version === expectedVersion);
    if (exact) {
      return exact;
    }
  }

  if (options.requestedVersion !== DEFAULT_VERSION) {
    const requested = normalizeVersion(options.requestedVersion);
    const exact = installed.find((entry) => entry.version === requested);
    if (exact) {
      return exact;
    }
  }

  const beforePaths = new Set(
    options.beforeInstall.map((entry) => entry.dictPath),
  );
  const added = installed.filter((entry) => !beforePaths.has(entry.dictPath));
  if (added.length > 0) {
    added.sort((left, right) =>
      compareVersionDescending(left.version, right.version),
    );
    return added[0] ?? null;
  }

  // When installation overwrites an existing root dictionary in-place,
  // the path is not "added". Prefer that root entry over unrelated versioned entries.
  const root = installed.find((entry) => entry.version === null);
  if (root) {
    return root;
  }

  installed.sort((left, right) =>
    compareVersionDescending(left.version, right.version),
  );
  return installed[0] ?? null;
}

export function listInstalledDictionaries(
  outDir: string,
): InstalledDictionary[] {
  const normalizedOutDir = toAbsolute(normalizeOutDir(outDir));
  const results: InstalledDictionary[] = [];
  const allTypes: DictionaryType[] = ["core", "small", "full"];

  const rootCandidates = [
    {
      type: "core" as const,
      file: join(normalizedOutDir, DICT_FILE_BY_TYPE.core),
    },
    {
      type: "small" as const,
      file: join(normalizedOutDir, DICT_FILE_BY_TYPE.small),
    },
    {
      type: "full" as const,
      file: join(normalizedOutDir, DICT_FILE_BY_TYPE.full),
    },
  ];
  for (const candidate of rootCandidates) {
    if (existsSync(candidate.file)) {
      results.push({
        type: candidate.type,
        version: null,
        dictPath: candidate.file,
        baseDir: normalizedOutDir,
      });
    }
  }
  for (const file of GENERIC_DICT_FILES) {
    const generic = join(normalizedOutDir, file);
    if (!existsSync(generic)) {
      continue;
    }

    for (const type of allTypes) {
      results.push({
        type,
        version: null,
        dictPath: generic,
        baseDir: normalizedOutDir,
      });
    }
  }

  for (const entry of listDirectorySafe(normalizedOutDir)) {
    const entryDir = join(normalizedOutDir, entry);
    const version = versionFromDirectoryName(entry);
    if (!version || !existsSync(entryDir)) {
      continue;
    }

    const candidate = join(entryDir, DICT_FILE_BY_TYPE.core);
    if (existsSync(candidate)) {
      results.push({
        type: "core",
        version,
        dictPath: candidate,
        baseDir: entryDir,
      });
    }

    const smallCandidate = join(entryDir, DICT_FILE_BY_TYPE.small);
    if (existsSync(smallCandidate)) {
      results.push({
        type: "small",
        version,
        dictPath: smallCandidate,
        baseDir: entryDir,
      });
    }

    const fullCandidate = join(entryDir, DICT_FILE_BY_TYPE.full);
    if (existsSync(fullCandidate)) {
      results.push({
        type: "full",
        version,
        dictPath: fullCandidate,
        baseDir: entryDir,
      });
    }

    for (const file of GENERIC_DICT_FILES) {
      const generic = join(entryDir, file);
      if (!existsSync(generic)) {
        continue;
      }

      for (const type of allTypes) {
        results.push({
          type,
          version,
          dictPath: generic,
          baseDir: entryDir,
        });
      }
    }
  }

  return results;
}

export function findInstalledDictionary(
  options: SetupDictionaryOptions,
): InstalledDictionary | null {
  const installed = listInstalledDictionaries(options.outDir).filter(
    (entry) => entry.type === options.type,
  );
  if (installed.length === 0) {
    return null;
  }

  if (options.version !== DEFAULT_VERSION) {
    const expected = normalizeVersion(options.version);
    const exact = installed.find((entry) => entry.version === expected);
    return exact ?? null;
  }

  installed.sort((left, right) =>
    compareVersionDescending(left.version, right.version),
  );
  return installed[0] ?? null;
}

export function buildReleaseApiUrl(version: string): string {
  if (version === DEFAULT_VERSION) {
    return `${GITHUB_RELEASES_API}/latest`;
  }

  return `${GITHUB_RELEASES_API}/tags/${encodeURIComponent(version)}`;
}

export function buildExpectedAssetName(
  type: DictionaryType,
  releaseTag: string,
): string {
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

export async function resolveDictionaryDownload(
  options: SetupDictionaryOptions,
): Promise<DictionaryDownload> {
  if (options.url) {
    const name =
      options.url.split("/").pop() ?? `sudachi-dictionary-${options.type}.zip`;
    return {
      name,
      url: options.url,
      releaseTag: inferReleaseTagFromAssetName(name, options.type),
    };
  }

  const release = await fetchReleaseMetadata(options.version);
  const asset = resolveDictionaryAsset(release, options.type);
  return {
    name: asset.name,
    url: asset.browser_download_url,
    releaseTag: release.tag_name,
  };
}

async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

function toAbsoluteIfInsideOutDir(
  outDir: string,
  candidate: string,
): string | null {
  const absoluteOutDir = toAbsolute(outDir);
  const absoluteCandidate = toAbsolute(join(outDir, candidate));
  if (
    absoluteCandidate === absoluteOutDir ||
    absoluteCandidate.startsWith(`${absoluteOutDir}${sep}`)
  ) {
    return absoluteCandidate;
  }

  return null;
}

async function listArchiveEntries(archivePath: string): Promise<string[]> {
  const process = Bun.spawn(["unzip", "-Z1", archivePath], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await process.exited;
  if (exitCode !== 0) {
    throw new Error(`Failed to inspect archive entries: ${archivePath}`);
  }

  const output = await new Response(process.stdout).text();
  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function resolveDictionaryPathsFromArchiveEntries(
  outDir: string,
  archiveEntries: string[],
  type: DictionaryType,
): string[] {
  const typeSpecificName = DICT_FILE_BY_TYPE[type];
  const preferredNames = new Set([
    typeSpecificName,
    "system.dic",
    "system.dic.test",
  ]);
  const basename = (entry: string): string => entry.split("/").at(-1) ?? entry;
  const preferredEntries = archiveEntries.filter((entry) =>
    preferredNames.has(basename(entry)),
  );
  const fallbackEntries =
    preferredEntries.length > 0
      ? preferredEntries
      : archiveEntries.filter((entry) => {
          const file = basename(entry);
          return file.endsWith(".dic") || file.endsWith(".dic.test");
        });

  const resolved = fallbackEntries
    .map((entry) => toAbsoluteIfInsideOutDir(outDir, entry))
    .filter((entry): entry is string => entry !== null);
  return [...new Set(resolved)];
}

export async function downloadArchive(
  url: string,
  archivePath: string,
): Promise<void> {
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
    throw new Error(
      `Dictionary download failed from ${url} with HTTP ${response.status} ${response.statusText}`,
    );
  }

  const body = await response.arrayBuffer();
  await Bun.write(archivePath, body);
}

export async function unzipArchive(
  archivePath: string,
  outDir: string,
): Promise<void> {
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

export async function setupDictionary(
  options: SetupDictionaryOptions,
): Promise<DictionarySetupResult> {
  const outDir = normalizeOutDir(options.outDir);
  const beforeInstall = listInstalledDictionaries(outDir);
  const download = await resolveDictionaryDownload(options);
  const archivePath = `${outDir}/${download.name}`;
  const resolvedVersion = download.releaseTag ?? options.version;
  const fallbackExtractedDir = extractedDirFromVersion(outDir, resolvedVersion);
  const fallbackDictPath = join(
    fallbackExtractedDir,
    DICT_FILE_BY_TYPE[options.type],
  );

  await ensureDirectory(outDir);

  console.log("Downloading dictionary");
  console.log(`  type: ${options.type}`);
  console.log(`  version: ${options.version}`);
  console.log(`  url: ${download.url}`);
  console.log(`  out: ${outDir}`);

  await downloadArchive(download.url, archivePath);
  const archiveEntries = await listArchiveEntries(archivePath);
  const extractedDictPaths = resolveDictionaryPathsFromArchiveEntries(
    outDir,
    archiveEntries,
    options.type,
  );
  if (extractedDictPaths.length === 0) {
    throw new Error(
      `The downloaded archive does not contain a dictionary file for type "${options.type}".\n` +
        `expected one of: ${DICT_FILE_BY_TYPE[options.type]}, system.dic, *.dic\n` +
        `archive: ${archivePath}\n` +
        `type: ${options.type}`,
    );
  }

  await unzipArchive(archivePath, outDir);

  const installed = findBestInstalledDictionary({
    type: options.type,
    requestedVersion: options.version,
    resolvedVersion,
    beforeInstall,
    afterInstall: listInstalledDictionaries(outDir),
  });
  const dictPathFromArchive = extractedDictPaths.find((candidatePath) =>
    existsSync(candidatePath),
  );
  const dictPathCandidate =
    dictPathFromArchive ?? installed?.dictPath ?? fallbackDictPath;
  if (!existsSync(dictPathCandidate)) {
    throw new Error(
      `Could not locate extracted dictionary file after installation.\n` +
        `expected: ${DICT_FILE_BY_TYPE[options.type]}\n` +
        `outDir: ${toAbsolute(outDir)}\n` +
        `archive: ${toAbsolute(archivePath)}`,
    );
  }
  const extractedDir = dictPathFromArchive
    ? dirname(dictPathFromArchive)
    : (installed?.baseDir ?? fallbackExtractedDir);
  const dictPath = dictPathCandidate;

  console.log(`Dictionary setup complete: ${outDir}`);
  return {
    type: options.type,
    version: installed?.version ?? normalizeVersion(resolvedVersion),
    outDir: toAbsolute(outDir),
    archivePath: toAbsolute(archivePath),
    extractedDir: toAbsolute(extractedDir),
    dictPath: toAbsolute(dictPath),
    downloaded: true,
    sourceUrl: download.url,
  };
}

export async function ensureDictionary(
  options: EnsureDictionaryOptions,
): Promise<DictionarySetupResult> {
  const outDir = normalizeOutDir(options.outDir);
  if (!options.forceDownload) {
    const installed = findInstalledDictionary({
      type: options.type,
      version: options.version,
      outDir,
      url: options.url,
    });
    if (installed) {
      return {
        type: installed.type,
        version: installed.version ?? normalizeVersion(options.version),
        outDir: toAbsolute(outDir),
        archivePath: "",
        extractedDir: toAbsolute(installed.baseDir),
        dictPath: toAbsolute(installed.dictPath),
        downloaded: false,
        sourceUrl: options.url ?? "",
      };
    }
  }

  return setupDictionary({
    type: options.type,
    version: options.version,
    outDir,
    url: options.url,
  });
}
