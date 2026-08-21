import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, rename, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createTokenizer, type Tokenizer } from "./core.ts";
import { createPretokenizer, type Pretokenizer } from "./pretokenizer.ts";
import {
  createSentenceSplitter,
  type SentenceSplitter,
} from "./sentence-splitter.ts";
import type { DictionaryOptions } from "./types.ts";

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
  resourceDir: string;
  defaultConfigPath: string;
  resourceFiles: string[];
  downloaded: boolean;
  sourceUrl: string;
};

const GITHUB_RELEASES_API =
  "https://api.github.com/repos/WorksApplications/SudachiDict/releases";
const DEFAULT_VERSION = "latest";
const GITHUB_API_VERSION = "2022-11-28";
const DEFAULT_RESOURCE_DIR_NAME = "resources";
const DEFAULT_CONFIG_FILE_NAME = "sudachi.json";
const FALLBACK_SUDACHI_RS_REVISION = "7e2f287";
const SUDACHI_RS_RESOURCE_FILES = [
  "sudachi.json",
  "char.def",
  "rewrite.def",
  "unk.def",
] as const;
const SUDACHI_RS_REVISION = resolveSudachiRsRevision();
const SUDACHI_RS_RAW_RESOURCES_BASE_URL = `https://raw.githubusercontent.com/WorksApplications/sudachi.rs/${SUDACHI_RS_REVISION}/resources`;
const GENERIC_DICT_FILES = ["system.dic", "system.dic.test"] as const;
const DICT_FILE_BY_TYPE: Record<DictionaryType, string> = {
  core: "system_core.dic",
  small: "system_small.dic",
  full: "system_full.dic",
};

export class Dictionary {
  readonly tokenizer: Tokenizer;
  readonly splitter: SentenceSplitter;
  readonly pretokenizer: Pretokenizer;

  constructor(
    tokenizer: Tokenizer,
    splitter: SentenceSplitter,
    pretokenizer: Pretokenizer,
  ) {
    this.tokenizer = tokenizer;
    this.splitter = splitter;
    this.pretokenizer = pretokenizer;
  }

  tokenize(
    ...args: Parameters<Tokenizer["tokenize"]>
  ): ReturnType<Tokenizer["tokenize"]> {
    return this.tokenizer.tokenize(...args);
  }

  lookup(
    ...args: Parameters<Tokenizer["lookup"]>
  ): ReturnType<Tokenizer["lookup"]> {
    return this.tokenizer.lookup(...args);
  }

  createPosMatcher(
    ...args: Parameters<Tokenizer["createPosMatcher"]>
  ): ReturnType<Tokenizer["createPosMatcher"]> {
    return this.tokenizer.createPosMatcher(...args);
  }

  pretokenize(
    ...args: Parameters<Pretokenizer["pretokenize"]>
  ): ReturnType<Pretokenizer["pretokenize"]> {
    return this.pretokenizer.pretokenize(...args);
  }

  splitSentences(
    ...args: Parameters<SentenceSplitter["split"]>
  ): ReturnType<SentenceSplitter["split"]> {
    return this.splitter.split(...args);
  }

  getEos(
    ...args: Parameters<SentenceSplitter["getEos"]>
  ): ReturnType<SentenceSplitter["getEos"]> {
    return this.splitter.getEos(...args);
  }

  close(): void {
    const errors: unknown[] = [];

    for (const resource of [this.pretokenizer, this.splitter, this.tokenizer]) {
      try {
        resource.close();
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      throw errors[0];
    }
  }

  [Symbol.dispose](): void {
    this.close();
  }
}

export function createDictionary(options: DictionaryOptions): Dictionary {
  const tokenizer = createTokenizer(options);

  try {
    const splitter = createSentenceSplitter(options.splitter ?? options);

    try {
      const pretokenizer = createPretokenizer(options.pretokenizer ?? options);
      return new Dictionary(tokenizer, splitter, pretokenizer);
    } catch (error) {
      splitter.close();
      throw error;
    }
  } catch (error) {
    tokenizer.close();
    throw error;
  }
}

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
  const match = new RegExp(
    `^(?:sudachidict_${type}-(\\d+)-py3-none-any\\.whl|sudachi-dictionary-(\\d+)-${type}\\.zip)$`,
    "i",
  ).exec(assetName);
  if (!match?.[1] && !match?.[2]) {
    return undefined;
  }

  return `v${match[1] ?? match[2]}`;
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
  return `sudachidict_${type}-${versionPart}-py3-none-any.whl`;
}

export function resolveDictionaryAsset(
  release: ReleaseMetadata,
  type: DictionaryType,
): ReleaseAsset {
  const expectedName = buildExpectedAssetName(type, release.tag_name);
  const legacyName = `sudachi-dictionary-${normalizeVersion(release.tag_name)}-${type}.zip`;
  const match =
    release.assets.find(
      (asset) => asset.name.toLowerCase() === expectedName.toLowerCase(),
    ) ??
    release.assets.find(
      (asset) => asset.name.toLowerCase() === legacyName.toLowerCase(),
    );
  if (match) {
    return match;
  }

  const available = release.assets.map((asset) => asset.name).join(", ");
  throw new Error(
    [
      `Could not find dictionary asset for type "${type}" in release ${release.tag_name}.`,
      `Expected: ${expectedName} or ${legacyName}`,
      available ? `Available: ${available}` : "Available: (none)",
      release.html_url ? `Release: ${release.html_url}` : undefined,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n"),
  );
}

async function fetchReleaseMetadata(version: string): Promise<ReleaseMetadata> {
  const url = buildReleaseApiUrl(version);
  const token =
    process.env.GITHUB_TOKEN ??
    process.env.GH_TOKEN ??
    process.env.SUDACHI_GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "sudachi-bun-dict-setup",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  };
  if (token && token.trim().length > 0) {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers,
    });
  } catch (error) {
    throw new Error(
      `Failed to fetch SudachiDict release metadata from ${url}.\n` +
        `If you are offline, retry with --url pointing to a local mirror.\n` +
        `Original error: ${(error as Error).message}`,
    );
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    const rateLimit = response.headers.get("x-ratelimit-remaining");
    const rateReset = response.headers.get("x-ratelimit-reset");
    const diagnostics = [
      bodyText ? `Response: ${bodyText}` : undefined,
      rateLimit !== null ? `x-ratelimit-remaining: ${rateLimit}` : undefined,
      rateReset !== null ? `x-ratelimit-reset: ${rateReset}` : undefined,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");
    throw new Error(
      `SudachiDict release metadata request failed for ${url} with HTTP ${response.status} ${response.statusText}` +
        (diagnostics ? `\n${diagnostics}` : ""),
    );
  }

  return (await response.json()) as ReleaseMetadata;
}

export async function resolveDictionaryDownload(
  options: SetupDictionaryOptions,
): Promise<DictionaryDownload> {
  if (options.url) {
    let pathname: string;
    try {
      pathname = new URL(options.url).pathname;
    } catch {
      pathname = options.url.split(/[?#]/, 1)[0] ?? "";
    }
    const name =
      pathname.split("/").pop() || `sudachi-dictionary-${options.type}.zip`;
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

function defaultResourceDir(outDir: string): string {
  return join(outDir, DEFAULT_RESOURCE_DIR_NAME);
}

function defaultConfigPath(outDir: string): string {
  return join(defaultResourceDir(outDir), DEFAULT_CONFIG_FILE_NAME);
}

function readTextFileOrEmpty(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function revisionFromCargoLock(content: string): string | null {
  const sourceMatch =
    /source = "git\+https:\/\/github\.com\/WorksApplications\/sudachi\.rs\.git\?rev=[^#"]*#([0-9a-f]{7,40})"/.exec(
      content,
    );
  if (sourceMatch?.[1]) {
    return sourceMatch[1];
  }

  return null;
}

function revisionFromCargoToml(content: string): string | null {
  const revMatch = /sudachi\s*=\s*\{[^}]*\brev\s*=\s*"([0-9a-f]{7,40})"/.exec(
    content,
  );
  if (revMatch?.[1]) {
    return revMatch[1];
  }

  return null;
}

function resolveSudachiRsRevision(): string {
  const cargoLockPath = resolve(import.meta.dir, "../sudachi-ffi/Cargo.lock");
  const cargoTomlPath = resolve(import.meta.dir, "../sudachi-ffi/Cargo.toml");

  const fromLock = revisionFromCargoLock(readTextFileOrEmpty(cargoLockPath));
  if (fromLock) {
    return fromLock;
  }

  const fromToml = revisionFromCargoToml(readTextFileOrEmpty(cargoTomlPath));
  if (fromToml) {
    return fromToml;
  }

  return FALLBACK_SUDACHI_RS_REVISION;
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
  archiveEntries: string[],
  type: DictionaryType,
): string | null {
  const typeSpecificName = DICT_FILE_BY_TYPE[type];
  const normalizeEntry = (entry: string): string => entry.replaceAll("\\", "/");
  const basename = (entry: string): string => {
    const normalized = normalizeEntry(entry);
    return normalized.split("/").at(-1) ?? normalized;
  };
  const packagePrefix = `sudachidict_${type.toLowerCase()}/`;
  const mismatchedPackage = /(?:^|\/)sudachidict_(core|small|full)\//i;
  const candidates = archiveEntries.filter((entry) => {
    const normalized = normalizeEntry(entry);
    const packageMatch = mismatchedPackage.exec(normalized);
    return !packageMatch || packageMatch[1]?.toLowerCase() === type;
  });
  const exactWheel = candidates.find(
    (entry) =>
      normalizeEntry(entry).toLowerCase() ===
      `${packagePrefix}resources/system.dic`,
  );
  if (exactWheel) return exactWheel;
  const preferred = candidates.find(
    (entry) => basename(entry) === typeSpecificName,
  );
  if (preferred) return preferred;
  const system = candidates.find((entry) => basename(entry) === "system.dic");
  if (system) return system;
  const test = candidates.find(
    (entry) => basename(entry) === "system.dic.test",
  );
  if (test) return test;
  return (
    candidates.find((entry) => {
      const file = basename(entry);
      return file.endsWith(".dic") || file.endsWith(".dic.test");
    }) ?? null
  );
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

async function downloadResourceFile(
  url: string,
  outputPath: string,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    throw new Error(
      `Failed to fetch Sudachi resources file from ${url}.\n` +
        `If you are offline, connect to the network and retry.\n` +
        `Original error: ${(error as Error).message}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Sudachi resources download failed from ${url} with HTTP ${response.status} ${response.statusText}`,
    );
  }

  const body = await response.arrayBuffer();
  await Bun.write(outputPath, body);
}

async function setupSudachiResources(outDir: string): Promise<{
  resourceDir: string;
  defaultConfigPath: string;
  resourceFiles: string[];
}> {
  const resourceDir = defaultResourceDir(outDir);
  await ensureDirectory(resourceDir);

  for (const file of SUDACHI_RS_RESOURCE_FILES) {
    const sourceUrl = `${SUDACHI_RS_RAW_RESOURCES_BASE_URL}/${file}`;
    const outputPath = join(resourceDir, file);
    await downloadResourceFile(sourceUrl, outputPath);
  }

  return {
    resourceDir: toAbsolute(resourceDir),
    defaultConfigPath: toAbsolute(defaultConfigPath(outDir)),
    resourceFiles: SUDACHI_RS_RESOURCE_FILES.map((file) =>
      toAbsolute(join(resourceDir, file)),
    ),
  };
}

async function ensureSudachiResources(outDir: string): Promise<{
  resourceDir: string;
  defaultConfigPath: string;
  resourceFiles: string[];
}> {
  const resourceDir = defaultResourceDir(outDir);
  await ensureDirectory(resourceDir);

  for (const file of SUDACHI_RS_RESOURCE_FILES) {
    const outputPath = join(resourceDir, file);
    if (existsSync(outputPath)) {
      continue;
    }
    const sourceUrl = `${SUDACHI_RS_RAW_RESOURCES_BASE_URL}/${file}`;
    await downloadResourceFile(sourceUrl, outputPath);
  }

  return {
    resourceDir: toAbsolute(resourceDir),
    defaultConfigPath: toAbsolute(defaultConfigPath(outDir)),
    resourceFiles: SUDACHI_RS_RESOURCE_FILES.map((file) =>
      toAbsolute(join(resourceDir, file)),
    ),
  };
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

async function extractArchiveEntry(
  archivePath: string,
  entry: string,
  outputPath: string,
): Promise<void> {
  const tempPath = `${outputPath}.tmp-${process.pid}-${randomUUID()}`;
  await ensureDirectory(dirname(outputPath));
  try {
    const process = Bun.spawn(["unzip", "-p", archivePath, entry], {
      stdout: Bun.file(tempPath),
      stderr: "pipe",
    });
    const exitCode = await process.exited;
    if (exitCode !== 0) {
      throw new Error(
        `Failed to extract dictionary entry ${entry} from ${archivePath}`,
      );
    }
    await rename(tempPath, outputPath);
  } catch (error) {
    await unlink(tempPath).catch(() => {});
    throw error;
  }
}

function versionFromArchiveEntries(
  entries: string[],
  type: DictionaryType,
): string | null {
  for (const entry of entries) {
    const match = /(?:^|\/)sudachi-dictionary-(\d+)\//.exec(entry);
    if (match?.[1]) return match[1];

    const wheelMetadata = new RegExp(
      `(?:^|\\/)sudachidict_${type}-(\\d+)\\.dist-info(?:\\/|$)`,
      "i",
    ).exec(entry);
    if (wheelMetadata?.[1]) return wheelMetadata[1];
  }
  return null;
}

export async function setupDictionary(
  options: SetupDictionaryOptions,
): Promise<DictionarySetupResult> {
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
  const archiveEntries = await listArchiveEntries(archivePath);
  const selectedEntry = resolveDictionaryPathsFromArchiveEntries(
    archiveEntries,
    options.type,
  );
  if (!selectedEntry) {
    throw new Error(
      `The downloaded archive does not contain a dictionary file for type "${options.type}".\n` +
        `expected one of: ${DICT_FILE_BY_TYPE[options.type]}, system.dic, *.dic\n` +
        `archive: ${archivePath}\n` +
        `type: ${options.type}`,
    );
  }

  const archiveVersion = versionFromArchiveEntries(
    archiveEntries,
    options.type,
  );
  const effectiveVersion = normalizeVersion(
    download.releaseTag ??
      inferReleaseTagFromAssetName(download.name, options.type) ??
      archiveVersion ??
      options.version,
  );
  if (!/^\d+$/.test(effectiveVersion)) {
    throw new Error(
      "Could not determine a numeric dictionary version from the custom archive. " +
        "Pass an explicit numeric --version (for example, --version 20260116).",
    );
  }
  const extractedDir = extractedDirFromVersion(outDir, effectiveVersion);
  const dictPath = join(extractedDir, DICT_FILE_BY_TYPE[options.type]);
  await extractArchiveEntry(archivePath, selectedEntry, dictPath);
  console.log("Downloading resources");
  const resources = await setupSudachiResources(outDir);

  console.log(`Dictionary setup complete: ${outDir}`);
  return {
    type: options.type,
    version: effectiveVersion,
    outDir: toAbsolute(outDir),
    archivePath: toAbsolute(archivePath),
    extractedDir: toAbsolute(extractedDir),
    dictPath: toAbsolute(dictPath),
    resourceDir: resources.resourceDir,
    defaultConfigPath: resources.defaultConfigPath,
    resourceFiles: resources.resourceFiles,
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
      const resources = await ensureSudachiResources(outDir);
      return {
        type: installed.type,
        version: installed.version ?? normalizeVersion(options.version),
        outDir: toAbsolute(outDir),
        archivePath: "",
        extractedDir: toAbsolute(installed.baseDir),
        dictPath: toAbsolute(installed.dictPath),
        resourceDir: resources.resourceDir,
        defaultConfigPath: resources.defaultConfigPath,
        resourceFiles: resources.resourceFiles,
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
