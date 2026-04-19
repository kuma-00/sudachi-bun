import { suffix } from "bun:ffi";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(MODULE_DIR, "../..");

function getCandidateBinaryNamesFromPlatform(): string[] {
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
  const variants = new Set<string>();

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

function resolveBinaryNameFromEnv(): string | null {
  const raw = process.env.SUDACHI_FFI_BINARY_NAME?.trim();
  if (!raw) {
    return null;
  }

  const normalized = raw.replaceAll("\\", "/");
  if (normalized.includes("/") || normalized === "." || normalized === "..") {
    throw new Error(
      "SUDACHI_FFI_BINARY_NAME must be a file name without directory segments.",
    );
  }

  return raw;
}

export function loadNativeLibraryPath(libraryPath?: string): string {
  const explicitPath =
    libraryPath?.trim() || process.env.SUDACHI_FFI_PATH?.trim();
  if (explicitPath) {
    return resolve(explicitPath);
  }

  const explicitDir = process.env.SUDACHI_FFI_DIR?.trim();
  const searchDirs = [
    explicitDir
      ? resolve(explicitDir)
      : resolve(PROJECT_ROOT, "sudachi-ffi", "target", "release"),
    resolve(PROJECT_ROOT, "sudachi-ffi", "target", "debug"),
  ];
  const candidateNames = [
    ...new Set(
      [
        resolveBinaryNameFromEnv(),
        `libsudachi_ffi.${suffix}`,
        `sudachi_ffi.${suffix}`,
        ...getCandidateBinaryNamesFromPlatform(),
      ].filter((name): name is string => Boolean(name)),
    ),
  ];

  for (const dir of searchDirs) {
    for (const candidateName of candidateNames) {
      const candidatePath = join(dir, candidateName);
      if (existsSync(candidatePath)) {
        return candidatePath;
      }
    }
  }

  const formattedCandidates = searchDirs
    .flatMap((dir) => candidateNames.map((name) => join(dir, name)))
    .join("\n  - ");

  throw new Error(
    [
      "Could not find the Sudachi native library.",
      "Build it first with `cd sudachi-ffi && cargo build --release`.",
      "Looked in:",
      `  - ${formattedCandidates}`,
    ].join("\n"),
  );
}
