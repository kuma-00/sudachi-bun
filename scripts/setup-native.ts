import { suffix } from "bun:ffi";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET_DIR = resolve(PROJECT_ROOT, "sudachi-ffi", "target", "release");
const DEFAULT_REPO_SLUG = "kuma-00/sudachi-bun";

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type ReleaseMetadata = {
  tag_name: string;
  assets: ReleaseAsset[];
};

function trimOrNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveRepoSlug(env: NodeJS.ProcessEnv = process.env): string {
  const explicit =
    trimOrNull(env.SUDACHI_FFI_GITHUB_REPOSITORY) ??
    trimOrNull(env.GITHUB_REPOSITORY);
  if (explicit) {
    return explicit;
  }

  return DEFAULT_REPO_SLUG;
}

export function resolveBinaryFileName(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = trimOrNull(env.SUDACHI_FFI_BINARY_NAME);
  if (!raw) {
    return `libsudachi_ffi.${suffix}`;
  }

  const normalized = raw.replaceAll("\\", "/");
  if (normalized.includes("/") || normalized === "." || normalized === "..") {
    throw new Error(
      "SUDACHI_FFI_BINARY_NAME must be a file name without directory segments.",
    );
  }

  return raw;
}

function getCandidateFileNames(): string[] {
  const platformAliases: Record<string, string[]> = {
    darwin: ["darwin", "macos"],
    linux: ["linux"],
    win32: ["windows", "win32"],
  };
  const archAliases: Record<string, string[]> = {
    x64: ["x86_64", "x64", "amd64"],
    arm64: ["aarch64", "arm64"],
  };

  const platforms = platformAliases[process.platform] ?? [process.platform];
  const arches = archAliases[process.arch] ?? [process.arch];
  const bases = [
    resolveBinaryFileName(),
    `libsudachi_ffi.${suffix}`,
    `sudachi_ffi.${suffix}`,
  ];
  const variants = new Set<string>(bases);

  for (const platform of platforms) {
    for (const arch of arches) {
      variants.add(`libsudachi_ffi-${platform}-${arch}.${suffix}`);
      variants.add(`sudachi_ffi-${platform}-${arch}.${suffix}`);
      variants.add(`sudachi-ffi-${platform}-${arch}.${suffix}`);
      variants.add(`libsudachi_ffi_${platform}_${arch}.${suffix}`);
      variants.add(`sudachi_ffi_${platform}_${arch}.${suffix}`);
    }
  }

  return Array.from(variants);
}

function getLocalCandidates(): string[] {
  return Array.from(
    new Set(getCandidateFileNames().map((name) => join(TARGET_DIR, name))),
  );
}

function resolveExistingLibraryPath(): string | null {
  for (const path of getLocalCandidates()) {
    if (existsSync(path)) {
      return path;
    }
  }
  return null;
}

async function fetchLatestRelease(
  repoSlug: string,
): Promise<ReleaseMetadata | null> {
  const headers = new Headers({
    Accept: "application/vnd.github+json",
    "User-Agent": "sudachi-bun/setup-native",
  });
  const githubToken = trimOrNull(process.env.GITHUB_TOKEN);
  if (githubToken) {
    headers.set("Authorization", `Bearer ${githubToken}`);
  }

  const response = await fetch(
    `https://api.github.com/repos/${repoSlug}/releases/latest`,
    { headers },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch release metadata: HTTP ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as ReleaseMetadata;
}

async function tryDownloadNativeLibrary(): Promise<string | null> {
  const explicitUrl = trimOrNull(process.env.SUDACHI_FFI_BINARY_URL);
  const repoSlug = resolveRepoSlug();

  mkdirSync(TARGET_DIR, { recursive: true });

  if (explicitUrl) {
    const fileName = resolveBinaryFileName();
    const outputPath = join(TARGET_DIR, fileName);
    const response = await fetch(explicitUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to download native binary from SUDACHI_FFI_BINARY_URL: HTTP ${response.status} ${response.statusText}`,
      );
    }
    await Bun.write(outputPath, await response.bytes());
    if (!existsSync(outputPath)) {
      throw new Error(
        `Native binary download completed but output was not found: ${outputPath}`,
      );
    }
    return outputPath;
  }

  const release = await fetchLatestRelease(repoSlug);
  if (!release) {
    return null;
  }

  const preferredNames = getCandidateFileNames();
  const assetByName = new Map(
    release.assets.map((asset) => [asset.name, asset]),
  );
  const match = preferredNames
    .map((name) => assetByName.get(name))
    .find(Boolean);
  if (!match) {
    return null;
  }

  const response = await fetch(match.browser_download_url);
  if (!response.ok) {
    throw new Error(
      `Failed to download ${match.name}: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const outputPath = join(TARGET_DIR, match.name);
  await Bun.write(outputPath, await response.bytes());

  return resolveExistingLibraryPath();
}

function buildNativeLibrary(): string | null {
  const build = Bun.spawnSync(["cargo", "build", "--release"], {
    cwd: resolve(PROJECT_ROOT, "sudachi-ffi"),
    stdout: "pipe",
    stderr: "pipe",
  });

  if (build.exitCode !== 0) {
    const stderr = build.stderr.toString().trim();
    const stdout = build.stdout.toString().trim();
    const output = stderr || stdout || "(no output)";
    throw new Error(`cargo build --release failed:\n${output}`);
  }

  return resolveExistingLibraryPath();
}

async function main(): Promise<void> {
  const existing = resolveExistingLibraryPath();
  if (existing) {
    console.log(`[sudachi-bun] Native library already present: ${existing}`);
    return;
  }

  let downloadError: Error | null = null;
  try {
    const downloaded = await tryDownloadNativeLibrary();
    if (downloaded) {
      console.log(`[sudachi-bun] Downloaded native library: ${downloaded}`);
      return;
    }
  } catch (error) {
    downloadError = error as Error;
    console.warn(
      `[sudachi-bun] Native download failed: ${downloadError.message}`,
    );
  }

  let buildError: Error | null = null;
  try {
    const built = buildNativeLibrary();
    if (built) {
      console.log(`[sudachi-bun] Built native library: ${built}`);
      return;
    }
  } catch (error) {
    buildError = error as Error;
  }

  const localCandidates = getLocalCandidates().join("\n  - ");
  const reasons = [
    "Could not prepare the Sudachi native library during bun install.",
    downloadError
      ? `Download attempt failed: ${downloadError.message}`
      : "Download attempt: no matching remote binary found for this platform.",
    buildError
      ? `Build attempt failed: ${buildError.message}`
      : "Build attempt finished but output library was not found.",
    "Looked for:",
    `  - ${localCandidates}`,
  ];

  throw new Error(reasons.join("\n"));
}

if (import.meta.main) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
