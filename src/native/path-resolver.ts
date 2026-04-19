import { suffix } from "bun:ffi";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(MODULE_DIR, "../..");

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
