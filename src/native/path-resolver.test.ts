import { suffix } from "bun:ffi";
import { afterEach, expect, mock, test } from "bun:test";
import * as fs from "node:fs";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ORIGINAL_SUDACHI_FFI_PATH = process.env.SUDACHI_FFI_PATH;
const ORIGINAL_SUDACHI_FFI_DIR = process.env.SUDACHI_FFI_DIR;

async function importPathResolver(moduleSuffix = "") {
  return import(`./path-resolver.ts${moduleSuffix}`);
}

afterEach(() => {
  if (ORIGINAL_SUDACHI_FFI_PATH === undefined) {
    delete process.env.SUDACHI_FFI_PATH;
  } else {
    process.env.SUDACHI_FFI_PATH = ORIGINAL_SUDACHI_FFI_PATH;
  }

  if (ORIGINAL_SUDACHI_FFI_DIR === undefined) {
    delete process.env.SUDACHI_FFI_DIR;
  } else {
    process.env.SUDACHI_FFI_DIR = ORIGINAL_SUDACHI_FFI_DIR;
  }

  mock.restore();
});

test("loadNativeLibraryPath resolves an explicit library path argument first", async () => {
  const { loadNativeLibraryPath } = await importPathResolver();
  delete process.env.SUDACHI_FFI_PATH;
  delete process.env.SUDACHI_FFI_DIR;

  const explicitRelativePath = "./tmp/lib/custom-native";
  expect(loadNativeLibraryPath(explicitRelativePath)).toBe(
    resolve(explicitRelativePath),
  );
});

test("loadNativeLibraryPath uses SUDACHI_FFI_PATH when no explicit argument is passed", async () => {
  const { loadNativeLibraryPath } = await importPathResolver();
  process.env.SUDACHI_FFI_PATH = "./tmp/lib/from-env";
  delete process.env.SUDACHI_FFI_DIR;

  expect(loadNativeLibraryPath()).toBe(resolve("./tmp/lib/from-env"));
});

test("loadNativeLibraryPath resolves from SUDACHI_FFI_DIR candidates when present", async () => {
  const { loadNativeLibraryPath } = await importPathResolver();
  delete process.env.SUDACHI_FFI_PATH;

  const resolverDir = mkdtempSync(join(tmpdir(), "sudachi-path-resolver-"));
  process.env.SUDACHI_FFI_DIR = resolverDir;

  const expectedPath = join(resolverDir, `libsudachi_ffi.${suffix}`);
  writeFileSync(expectedPath, "");

  expect(loadNativeLibraryPath()).toBe(expectedPath);
});

test("loadNativeLibraryPath throws with looked-up candidates when not found", async () => {
  delete process.env.SUDACHI_FFI_PATH;

  const missingDir = mkdtempSync(join(tmpdir(), "sudachi-path-missing-"));
  const nestedExplicitDir = join(missingDir, "nested", "release");
  mkdirSync(nestedExplicitDir, { recursive: true });
  process.env.SUDACHI_FFI_DIR = nestedExplicitDir;

  mock.module("node:fs", () => ({
    ...fs,
    existsSync: () => false,
  }));

  const { loadNativeLibraryPath } = await importPathResolver(
    `?missing=${Date.now()}`,
  );

  expect(() => loadNativeLibraryPath()).toThrow(
    "Could not find the Sudachi native library.",
  );

  try {
    loadNativeLibraryPath();
    throw new Error("expected loadNativeLibraryPath to throw");
  } catch (error) {
    const message = (error as Error).message;
    expect(message).toContain("Looked in:");
    expect(message).toContain(
      join(resolve(nestedExplicitDir), `libsudachi_ffi.${suffix}`),
    );
    expect(message).toContain(
      join(resolve(nestedExplicitDir), `sudachi_ffi.${suffix}`),
    );
  }
});
