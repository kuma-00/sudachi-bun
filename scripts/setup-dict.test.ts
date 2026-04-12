import { afterEach, expect, mock, spyOn, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildExpectedAssetName,
  type DictionaryType,
  downloadArchive,
  ensureDictionary,
  resolveDictionaryAsset,
  setupDictionary,
  unzipArchive,
} from "../src/dictionary.ts";

import { parseSetupDictionaryArgs } from "./setup-dict.ts";

afterEach(() => {
  mock.restore();
});

function mockUnzipFlow(
  archiveEntries: string[],
  onExtract: (outputDir: string) => void,
): void {
  spyOn(Bun, "spawn").mockImplementation((input: unknown) => {
    const args = Array.isArray(input)
      ? input
      : ((input as { cmd?: string[] }).cmd ?? []);
    if (args[0] === "unzip" && args[1] === "-Z1") {
      return {
        exited: Promise.resolve(0),
        stdout: `${archiveEntries.join("\n")}\n`,
      } as never;
    }

    if (args[0] === "unzip" && args[1] === "-o") {
      const outputDir = args[4];
      if (!outputDir) {
        throw new Error("missing unzip output dir");
      }
      onExtract(outputDir);
      return {
        exited: Promise.resolve(0),
      } as never;
    }

    throw new Error(`unexpected Bun.spawn args: ${args.join(" ")}`);
  });
}

test("parseSetupDictionaryArgs supports inline values", () => {
  expect(
    parseSetupDictionaryArgs([
      "--type=full",
      "--version=v20260116",
      "--out=./cache",
      "--url=https://example.com/dict.zip",
    ]),
  ).toEqual({
    type: "full",
    version: "v20260116",
    outDir: "./cache",
    url: "https://example.com/dict.zip",
  });
});

test("buildExpectedAssetName strips the v prefix from release tags", () => {
  expect(buildExpectedAssetName("core", "v20260116")).toBe(
    "sudachi-dictionary-20260116-core.zip",
  );
});

test("resolveDictionaryAsset matches the expected asset name", () => {
  const asset = resolveDictionaryAsset(
    {
      tag_name: "v20260116",
      assets: [
        {
          name: "sudachi-dictionary-20260116-core.zip",
          browser_download_url: "https://example.com/core.zip",
        },
        {
          name: "sudachi-dictionary-20260116-full.zip",
          browser_download_url: "https://example.com/full.zip",
        },
      ],
      html_url: "https://example.com/release",
    },
    "full" as DictionaryType,
  );

  expect(asset.browser_download_url).toBe("https://example.com/full.zip");
});

test("resolveDictionaryAsset reports available assets when missing", () => {
  expect(() =>
    resolveDictionaryAsset(
      {
        tag_name: "v20260116",
        assets: [
          {
            name: "other.zip",
            browser_download_url: "https://example.com/other.zip",
          },
        ],
      },
      "small" as DictionaryType,
    ),
  ).toThrow("Expected: sudachi-dictionary-20260116-small.zip");
});

test("downloadArchive saves fetched bytes to the specified archive path", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "sudachi-dict-download-"));
  const archivePath = join(outDir, "dict.zip");
  const payload = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);

  const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(payload.buffer, { status: 200 }) as never,
  );

  await downloadArchive(
    "https://example.com/sudachi-dictionary.zip",
    archivePath,
  );

  expect(fetchSpy).toHaveBeenCalledWith(
    "https://example.com/sudachi-dictionary.zip",
  );
  expect(readFileSync(archivePath)).toEqual(Buffer.from(payload));
});

test("unzipArchive invokes unzip with overwrite mode and destination directory", async () => {
  const spawnSpy = spyOn(Bun, "spawn").mockReturnValue({
    exited: Promise.resolve(0),
  } as never);

  await unzipArchive("/tmp/dict.zip", "/tmp/dict-out");

  expect(spawnSpy).toHaveBeenCalledWith(
    ["unzip", "-o", "/tmp/dict.zip", "-d", "/tmp/dict-out"],
    { stdout: "inherit", stderr: "inherit" },
  );
});

test("setupDictionary downloads and expands the archive specified by --url", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "sudachi-dict-setup-"));
  const payload = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);
  const archivePath = join(outDir, "custom-dict.zip");

  const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(payload.buffer, { status: 200 }) as never,
  );
  const spawnSpy = spyOn(Bun, "spawn").mockImplementation((input: unknown) => {
    const args = Array.isArray(input)
      ? input
      : ((input as { cmd?: string[] }).cmd ?? []);
    if (args[0] === "unzip" && args[1] === "-Z1") {
      return {
        exited: Promise.resolve(0),
        stdout: "sudachi-dictionary-20260116/system_core.dic\n",
      } as never;
    }

    if (args[0] === "unzip" && args[1] === "-o") {
      const outputDir = args[4];
      if (!outputDir) {
        throw new Error("missing unzip output dir");
      }
      const extracted = join(outputDir, "sudachi-dictionary-20260116");
      mkdirSync(extracted, { recursive: true });
      writeFileSync(join(extracted, "system_core.dic"), "dummy");
      return {
        exited: Promise.resolve(0),
      } as never;
    }

    throw new Error(`unexpected Bun.spawn args: ${args.join(" ")}`);
  });
  const logSpy = spyOn(console, "log").mockImplementation(() => {});

  await setupDictionary({
    type: "core",
    version: "latest",
    outDir,
    url: "https://example.com/custom-dict.zip",
  });

  expect(logSpy).toHaveBeenCalled();
  expect(fetchSpy).toHaveBeenCalledWith("https://example.com/custom-dict.zip");
  expect(existsSync(archivePath)).toBe(true);
  expect(readFileSync(archivePath)).toEqual(Buffer.from(payload));
  expect(spawnSpy).toHaveBeenCalledWith(
    ["unzip", "-o", archivePath, "-d", outDir],
    { stdout: "inherit", stderr: "inherit" },
  );
});

test("setupDictionary resolves dictPath from extracted files even when --url filename has no version", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "sudachi-dict-setup-resolve-"));
  const payload = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);

  spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(payload.buffer, { status: 200 }) as never,
  );
  mockUnzipFlow(
    ["sudachi-dictionary-20260116/system_core.dic"],
    (outputDir) => {
      const extracted = join(outputDir, "sudachi-dictionary-20260116");
      mkdirSync(extracted, { recursive: true });
      writeFileSync(join(extracted, "system_core.dic"), "dummy");
    },
  );
  spyOn(console, "log").mockImplementation(() => {});

  const result = await setupDictionary({
    type: "core",
    version: "latest",
    outDir,
    url: "https://example.com/custom-name.zip",
  });

  expect(result.version).toBe("20260116");
  expect(result.dictPath).toBe(
    join(outDir, "sudachi-dictionary-20260116", "system_core.dic"),
  );
  expect(existsSync(result.dictPath)).toBe(true);
});

test("setupDictionary prefers overwritten root dictionary when no new path is added", async () => {
  const outDir = mkdtempSync(
    join(tmpdir(), "sudachi-dict-setup-overwrite-root-"),
  );
  const rootDictPath = join(outDir, "system_core.dic");
  const olderVersionDir = join(outDir, "sudachi-dictionary-20270101");
  const olderVersionPath = join(olderVersionDir, "system_core.dic");
  const payload = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);

  mkdirSync(olderVersionDir, { recursive: true });
  writeFileSync(olderVersionPath, "older");
  writeFileSync(rootDictPath, "before");

  spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(payload.buffer, { status: 200 }) as never,
  );
  mockUnzipFlow(["system_core.dic"], () => {
    writeFileSync(rootDictPath, "after");
  });
  spyOn(console, "log").mockImplementation(() => {});

  const result = await setupDictionary({
    type: "core",
    version: "latest",
    outDir,
    url: "https://example.com/custom-dict.zip",
  });

  expect(result.dictPath).toBe(rootDictPath);
  expect(readFileSync(rootDictPath, "utf8")).toBe("after");
});

test("ensureDictionary reuses an already-installed dictionary without network/download", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "sudachi-dict-existing-"));
  const extractDir = join(outDir, "sudachi-dictionary-20260116");
  const dictPath = join(extractDir, "system_core.dic");
  mkdirSync(extractDir, { recursive: true });
  writeFileSync(dictPath, "dummy");

  const fetchSpy = spyOn(globalThis, "fetch");
  const spawnSpy = spyOn(Bun, "spawn");

  const result = await ensureDictionary({
    type: "core",
    version: "latest",
    outDir,
  });

  expect(result.downloaded).toBe(false);
  expect(result.dictPath).toBe(dictPath);
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(spawnSpy).not.toHaveBeenCalled();
});

test("ensureDictionary reuses an existing dictionary even when --url is explicitly provided", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "sudachi-dict-url-force-"));
  const existingExtractDir = join(outDir, "sudachi-dictionary-20250101");
  const existingDictPath = join(existingExtractDir, "system_core.dic");
  mkdirSync(existingExtractDir, { recursive: true });
  writeFileSync(existingDictPath, "old-dummy");

  const fetchSpy = spyOn(globalThis, "fetch");
  const spawnSpy = spyOn(Bun, "spawn");

  const result = await ensureDictionary({
    type: "core",
    version: "latest",
    outDir,
    url: "https://example.com/custom-dict.zip",
  });

  expect(result.downloaded).toBe(false);
  expect(result.dictPath).toBe(existingDictPath);
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(spawnSpy).not.toHaveBeenCalled();
});

test("ensureDictionary downloads and extracts when no installed dictionary exists", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "sudachi-dict-ensure-"));

  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(((
    url: string | URL | Request,
  ) => {
    const endpoint = String(url);
    if (endpoint.includes("/releases/tags/v20260116")) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            tag_name: "v20260116",
            assets: [
              {
                name: "sudachi-dictionary-20260116-core.zip",
                browser_download_url:
                  "https://example.com/sudachi-dictionary-20260116-core.zip",
              },
            ],
          }),
          { status: 200 },
        ),
      ) as Promise<Response>;
    }

    if (
      endpoint === "https://example.com/sudachi-dictionary-20260116-core.zip"
    ) {
      return Promise.resolve(
        new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer, {
          status: 200,
        }),
      ) as Promise<Response>;
    }

    throw new Error(`unexpected fetch url: ${endpoint}`);
  }) as typeof fetch);

  const spawnSpy = spyOn(Bun, "spawn").mockImplementation((input: unknown) => {
    const args = Array.isArray(input)
      ? input
      : ((input as { cmd?: string[] }).cmd ?? []);
    if (args[0] === "unzip" && args[1] === "-Z1") {
      return {
        exited: Promise.resolve(0),
        stdout: "sudachi-dictionary-20260116/system_core.dic\n",
      } as never;
    }

    if (args[0] === "unzip" && args[1] === "-o") {
      const outputDir = args[4];
      if (!outputDir) {
        throw new Error("missing unzip output dir");
      }

      const extracted = join(outputDir, "sudachi-dictionary-20260116");
      mkdirSync(extracted, { recursive: true });
      writeFileSync(join(extracted, "system_core.dic"), "dummy");

      return {
        exited: Promise.resolve(0),
      } as never;
    }

    throw new Error(`unexpected Bun.spawn args: ${args.join(" ")}`);
  });

  const result = await ensureDictionary({
    type: "core",
    version: "v20260116",
    outDir,
  });

  expect(result.downloaded).toBe(true);
  expect(existsSync(result.dictPath)).toBe(true);
  expect(fetchSpy).toHaveBeenCalled();
  expect(spawnSpy).toHaveBeenCalled();
});

test("setupDictionary throws when archive does not contain the expected dictionary file", async () => {
  const outDir = mkdtempSync(
    join(tmpdir(), "sudachi-dict-setup-missing-dict-entry-"),
  );
  const payload = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);
  const existingDir = join(outDir, "sudachi-dictionary-20250101");
  mkdirSync(existingDir, { recursive: true });
  writeFileSync(join(existingDir, "system_core.dic"), "old-dummy");

  spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(payload.buffer, { status: 200 }) as never,
  );
  spyOn(Bun, "spawn").mockImplementation((input: unknown) => {
    const args = Array.isArray(input)
      ? input
      : ((input as { cmd?: string[] }).cmd ?? []);
    if (args[0] === "unzip" && args[1] === "-Z1") {
      return {
        exited: Promise.resolve(0),
        stdout: "README.txt\n",
      } as never;
    }

    if (args[0] === "unzip" && args[1] === "-o") {
      return {
        exited: Promise.resolve(0),
      } as never;
    }

    throw new Error(`unexpected Bun.spawn args: ${args.join(" ")}`);
  });
  spyOn(console, "log").mockImplementation(() => {});

  await expect(
    setupDictionary({
      type: "core",
      version: "latest",
      outDir,
      url: "https://example.com/custom-dict.zip",
    }),
  ).rejects.toThrow("does not contain a dictionary file");
});

test("setupDictionary accepts Rust-style system.dic paths from custom archives", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "sudachi-dict-setup-system-dic-"));
  const payload = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);

  spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(payload.buffer, { status: 200 }) as never,
  );
  mockUnzipFlow(["sudachi/resources/system.dic"], (outputDir) => {
    const extracted = join(outputDir, "sudachi", "resources");
    mkdirSync(extracted, { recursive: true });
    writeFileSync(join(extracted, "system.dic"), "dummy");
  });
  spyOn(console, "log").mockImplementation(() => {});

  const result = await setupDictionary({
    type: "small",
    version: "latest",
    outDir,
    url: "https://example.com/custom-dict.zip",
  });

  expect(result.dictPath).toBe(
    join(outDir, "sudachi", "resources", "system.dic"),
  );
  expect(existsSync(result.dictPath)).toBe(true);
});

test("ensureDictionary reuses Rust-style system.dic without downloading", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "sudachi-dict-ensure-system-dic-"));
  const versionDir = join(outDir, "sudachi-dictionary-20260116");
  const dictPath = join(versionDir, "system.dic");
  mkdirSync(versionDir, { recursive: true });
  writeFileSync(dictPath, "dummy");

  const fetchSpy = spyOn(globalThis, "fetch");
  const spawnSpy = spyOn(Bun, "spawn");

  const result = await ensureDictionary({
    type: "small",
    version: "v20260116",
    outDir,
    url: "https://example.com/custom-dict.zip",
  });

  expect(result.downloaded).toBe(false);
  expect(result.dictPath).toBe(dictPath);
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(spawnSpy).not.toHaveBeenCalled();
});
