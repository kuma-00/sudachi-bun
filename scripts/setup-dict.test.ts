import { afterEach, expect, mock, spyOn, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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
  listInstalledDictionaries,
  resolveDictionaryAsset,
  resolveDictionaryDownload,
  setupDictionary,
  unzipArchive,
} from "../src/dictionary.ts";

import {
  formatSetupDictionaryResult,
  parseSetupDictionaryArgs,
} from "./setup-dict.ts";

const SUDACHI_RS_RESOURCE_URL_PREFIX =
  "https://raw.githubusercontent.com/WorksApplications/sudachi.rs/";

afterEach(() => {
  mock.restore();
});

function isSudachiResourceUrl(url: string): boolean {
  return (
    url.startsWith(SUDACHI_RS_RESOURCE_URL_PREFIX) &&
    url.includes("/resources/")
  );
}

function createBinaryOkFetch(payload: Uint8Array): typeof fetch {
  return ((..._args: Parameters<typeof fetch>) =>
    Promise.resolve(
      new Response(payload.buffer, { status: 200 }),
    )) as typeof fetch;
}

function createResourceFiles(outDir: string): void {
  const resourceDir = join(outDir, "resources");
  mkdirSync(resourceDir, { recursive: true });
  writeFileSync(join(resourceDir, "sudachi.json"), "{}");
  writeFileSync(join(resourceDir, "char.def"), "dummy");
  writeFileSync(join(resourceDir, "rewrite.def"), "dummy");
  writeFileSync(join(resourceDir, "unk.def"), "dummy");
}

function mockUnzipFlow(
  archiveEntries: string[],
  _onExtract?: (outputDir: string) => void,
): void {
  spyOn(Bun, "spawn").mockImplementation(
    (input: unknown, options?: unknown) => {
      const args = Array.isArray(input)
        ? input
        : ((input as { cmd?: string[] }).cmd ?? []);
      if (args[0] === "unzip" && args[1] === "-Z1") {
        return {
          exited: Promise.resolve(0),
          stdout: `${archiveEntries.join("\n")}\n`,
        } as never;
      }

      if (args[0] === "unzip" && args[1] === "-p") {
        const output = (options as { stdout?: { name?: string } } | undefined)
          ?.stdout;
        if (output?.name) {
          writeFileSync(output.name, "dummy");
        }
        return {
          exited: Promise.resolve(0),
        } as never;
      }

      throw new Error(`unexpected Bun.spawn args: ${args.join(" ")}`);
    },
  );
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

test("formatSetupDictionaryResult prints resolved paths", () => {
  const output = formatSetupDictionaryResult({
    type: "core",
    version: "20260116",
    outDir: "/work/dict",
    archivePath: "/work/dict/archive.whl",
    extractedDir: "/work/dict/sudachi-dictionary-20260116",
    dictPath: "/work/dict/sudachi-dictionary-20260116/system_core.dic",
    resourceDir: "/work/dict/resources",
    defaultConfigPath: "/work/dict/resources/sudachi.json",
    resourceFiles: [],
    downloaded: true,
    sourceUrl: "https://example.com/archive.whl",
  });

  expect(output).toStartWith("Resolved dictionary paths:\n");
  expect(output).toContain("version: 20260116");
  expect(output).toContain(
    "dictPath: /work/dict/sudachi-dictionary-20260116/system_core.dic",
  );
  expect(output).toContain("resourceDir: /work/dict/resources");
  expect(output).toContain(
    "defaultConfigPath: /work/dict/resources/sudachi.json",
  );
  expect(output).not.toContain("<version>");
});

test("buildExpectedAssetName strips the v prefix from release tags", () => {
  expect(buildExpectedAssetName("core", "v20260116")).toBe(
    "sudachidict_core-20260116-py3-none-any.whl",
  );
});

test("resolveDictionaryDownload strips query and fragment from custom URL filenames", async () => {
  const download = await resolveDictionaryDownload({
    type: "core",
    version: "latest",
    outDir: "./dict",
    url: "https://example.com/sudachidict_core-20260116-py3-none-any.whl?token=secret#download",
  });

  expect(download.name).toBe("sudachidict_core-20260116-py3-none-any.whl");
  expect(download.releaseTag).toBe("v20260116");
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
  ).toThrow("Expected: sudachidict_small-20260116-py3-none-any.whl");
});

test("resolveDictionaryAsset prefers wheel over legacy ZIP and ignores sdist", () => {
  const assets = [
    { name: "sudachidict_core-20260116.tar.gz", browser_download_url: "sdist" },
    {
      name: "sudachi-dictionary-20260116-core.zip",
      browser_download_url: "zip",
    },
    {
      name: "SuDaChIdIcT_core-20260116-py3-none-any.whl",
      browser_download_url: "wheel",
    },
  ];
  expect(
    resolveDictionaryAsset({ tag_name: "v20260116", assets }, "core")
      .browser_download_url,
  ).toBe("wheel");
});

test("resolveDictionaryAsset falls back to legacy ZIP", () => {
  const asset = resolveDictionaryAsset(
    {
      tag_name: "v20260116",
      assets: [
        {
          name: "sudachi-dictionary-20260116-small.zip",
          browser_download_url: "zip",
        },
      ],
    },
    "small",
  );
  expect(asset.name).toBe("sudachi-dictionary-20260116-small.zip");
});

test("installed dictionaries coexist by type and version", () => {
  const outDir = mkdtempSync(join(tmpdir(), "sudachi-dict-installed-"));
  const dictionaries: Array<[string, string]> = [
    ["20260116", "core"],
    ["20260116", "small"],
    ["20250101", "full"],
  ];
  for (const [version, type] of dictionaries) {
    const dir = join(outDir, `sudachi-dictionary-${version}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `system_${type}.dic`), type);
  }
  expect(
    listInstalledDictionaries(outDir)
      .map((entry) => `${entry.version}:${entry.type}`)
      .sort(),
  ).toEqual(["20250101:full", "20260116:core", "20260116:small"]);
});

test("downloadArchive saves fetched bytes to the specified archive path", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "sudachi-dict-download-"));
  const archivePath = join(outDir, "dict.zip");
  const payload = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);

  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    createBinaryOkFetch(payload),
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

  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    createBinaryOkFetch(payload),
  );
  const spawnSpy = spyOn(Bun, "spawn").mockImplementation(
    (input: unknown, options?: unknown) => {
      const args = Array.isArray(input)
        ? input
        : ((input as { cmd?: string[] }).cmd ?? []);
      if (args[0] === "unzip" && args[1] === "-Z1") {
        return {
          exited: Promise.resolve(0),
          stdout: "sudachi-dictionary-20260116/system_core.dic\n",
        } as never;
      }

      if (args[0] === "unzip" && args[1] === "-p") {
        const output = (options as { stdout?: { name?: string } } | undefined)
          ?.stdout;
        if (output?.name) {
          writeFileSync(output.name, "dummy");
        }
        return {
          exited: Promise.resolve(0),
        } as never;
      }

      throw new Error(`unexpected Bun.spawn args: ${args.join(" ")}`);
    },
  );
  const logSpy = spyOn(console, "log").mockImplementation(() => {});

  const result = await setupDictionary({
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
    ["unzip", "-p", archivePath, "sudachi-dictionary-20260116/system_core.dic"],
    { stdout: expect.anything(), stderr: "pipe" },
  );
  expect(result.resourceDir).toBe(join(outDir, "resources"));
  expect(result.defaultConfigPath).toBe(
    join(outDir, "resources", "sudachi.json"),
  );
  expect(result.resourceFiles).toEqual([
    join(outDir, "resources", "sudachi.json"),
    join(outDir, "resources", "char.def"),
    join(outDir, "resources", "rewrite.def"),
    join(outDir, "resources", "unk.def"),
  ]);
  expect(existsSync(join(outDir, "resources", "system.dic"))).toBe(false);
  expect(existsSync(join(outDir, "resources", "sudachi.json"))).toBe(true);
});

test("setupDictionary resolves dictPath from extracted files even when --url filename has no version", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "sudachi-dict-setup-resolve-"));
  const payload = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);

  spyOn(globalThis, "fetch").mockImplementation(createBinaryOkFetch(payload));
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

test("setupDictionary infers an opaque wheel version from dist-info and ensureDictionary reuses it", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "sudachi-dict-setup-dist-info-"));
  const payload = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);

  spyOn(globalThis, "fetch").mockImplementation((async (input) => {
    const url = String(input);
    if (url === "https://example.com/download") {
      return new Response(payload, { status: 200 });
    }
    if (isSudachiResourceUrl(url)) {
      return new Response("{}", { status: 200 });
    }
    throw new Error(`unexpected fetch url: ${url}`);
  }) as typeof fetch);
  mockUnzipFlow([
    "sudachidict_core/resources/system.dic",
    "sudachidict_core-20260116.dist-info/METADATA",
  ]);
  spyOn(console, "log").mockImplementation(() => {});

  const installed = await setupDictionary({
    type: "core",
    version: "latest",
    outDir,
    url: "https://example.com/download",
  });

  expect(installed.version).toBe("20260116");
  const reused = await ensureDictionary({
    type: "core",
    version: "latest",
    outDir,
    url: "https://example.com/download",
  });
  expect(reused.downloaded).toBe(false);
  expect(reused.dictPath).toBe(installed.dictPath);
});

test.each([
  "latest",
  "custom",
])("setupDictionary rejects a versionless custom archive when version is %s", async (version) => {
  const outDir = mkdtempSync(join(tmpdir(), "sudachi-dict-setup-no-version-"));
  const payload = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]);

  spyOn(globalThis, "fetch").mockImplementation(createBinaryOkFetch(payload));
  mockUnzipFlow(["system_core.dic"]);
  spyOn(console, "log").mockImplementation(() => {});

  await expect(
    setupDictionary({
      type: "core",
      version,
      outDir,
      url: "https://example.com/custom-dict.zip",
    }),
  ).rejects.toThrow("Pass an explicit numeric --version");
  expect(existsSync(join(outDir, `sudachi-dictionary-${version}`))).toBe(false);
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

  spyOn(globalThis, "fetch").mockImplementation(createBinaryOkFetch(payload));
  mockUnzipFlow(["system_core.dic"], () => {
    writeFileSync(rootDictPath, "after");
  });
  spyOn(console, "log").mockImplementation(() => {});

  const result = await setupDictionary({
    type: "core",
    version: "20260116",
    outDir,
    url: "https://example.com/custom-dict.zip",
  });

  expect(result.dictPath).toBe(
    join(outDir, "sudachi-dictionary-20260116", "system_core.dic"),
  );
  expect(readFileSync(rootDictPath, "utf8")).toBe("before");
});

test("ensureDictionary reuses an already-installed dictionary without network/download", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "sudachi-dict-existing-"));
  const extractDir = join(outDir, "sudachi-dictionary-20260116");
  const dictPath = join(extractDir, "system_core.dic");
  mkdirSync(extractDir, { recursive: true });
  writeFileSync(dictPath, "dummy");
  createResourceFiles(outDir);

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
  createResourceFiles(outDir);

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

    if (isSudachiResourceUrl(endpoint)) {
      return Promise.resolve(
        new Response("{}", {
          status: 200,
        }),
      ) as Promise<Response>;
    }

    throw new Error(`unexpected fetch url: ${endpoint}`);
  }) as typeof fetch);

  const spawnSpy = spyOn(Bun, "spawn").mockImplementation(
    (input: unknown, options?: unknown) => {
      const args = Array.isArray(input)
        ? input
        : ((input as { cmd?: string[] }).cmd ?? []);
      if (args[0] === "unzip" && args[1] === "-Z1") {
        return {
          exited: Promise.resolve(0),
          stdout: "sudachi-dictionary-20260116/system_core.dic\n",
        } as never;
      }

      if (args[0] === "unzip" && args[1] === "-p") {
        const output = (options as { stdout?: { name?: string } } | undefined)
          ?.stdout;
        if (output?.name) {
          writeFileSync(output.name, "dummy");
        }
        return {
          exited: Promise.resolve(0),
        } as never;
      }

      throw new Error(`unexpected Bun.spawn args: ${args.join(" ")}`);
    },
  );

  const result = await ensureDictionary({
    type: "core",
    version: "v20260116",
    outDir,
  });

  expect(result.downloaded).toBe(true);
  expect(existsSync(result.dictPath)).toBe(true);
  expect(existsSync(join(outDir, "resources", "sudachi.json"))).toBe(true);
  expect(existsSync(join(outDir, "resources", "system.dic"))).toBe(false);
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

  spyOn(globalThis, "fetch").mockImplementation(createBinaryOkFetch(payload));
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

    if (args[0] === "unzip" && args[1] === "-p") {
      return {
        exited: Promise.resolve(0),
        stdout: new Response("dummy").body,
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

  spyOn(globalThis, "fetch").mockImplementation(createBinaryOkFetch(payload));
  mockUnzipFlow(["sudachi/resources/system.dic"], (outputDir) => {
    const extracted = join(outputDir, "sudachi", "resources");
    mkdirSync(extracted, { recursive: true });
    writeFileSync(join(extracted, "system.dic"), "dummy");
  });
  spyOn(console, "log").mockImplementation(() => {});

  const result = await setupDictionary({
    type: "small",
    version: "20260116",
    outDir,
    url: "https://example.com/custom-dict.zip",
  });

  expect(result.dictPath).toBe(
    join(outDir, "sudachi-dictionary-20260116", "system_small.dic"),
  );
  expect(existsSync(result.dictPath)).toBe(true);
});

test("ensureDictionary reuses Rust-style system.dic without downloading", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "sudachi-dict-ensure-system-dic-"));
  const versionDir = join(outDir, "sudachi-dictionary-20260116");
  const dictPath = join(versionDir, "system.dic");
  mkdirSync(versionDir, { recursive: true });
  writeFileSync(dictPath, "dummy");
  createResourceFiles(outDir);

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

test("ensureDictionary downloads only missing resources when dictionary is already installed", async () => {
  const outDir = mkdtempSync(
    join(tmpdir(), "sudachi-dict-ensure-missing-resources-"),
  );
  const versionDir = join(outDir, "sudachi-dictionary-20260116");
  const dictPath = join(versionDir, "system_core.dic");
  mkdirSync(versionDir, { recursive: true });
  writeFileSync(dictPath, "dummy");

  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(((
    url: string | URL | Request,
  ) => {
    const endpoint = String(url);
    if (isSudachiResourceUrl(endpoint)) {
      return Promise.resolve(
        new Response("{}", { status: 200 }),
      ) as Promise<Response>;
    }

    throw new Error(`unexpected fetch url: ${endpoint}`);
  }) as typeof fetch);
  const spawnSpy = spyOn(Bun, "spawn");

  const result = await ensureDictionary({
    type: "core",
    version: "latest",
    outDir,
  });

  expect(result.downloaded).toBe(false);
  expect(result.dictPath).toBe(dictPath);
  expect(existsSync(join(outDir, "resources", "sudachi.json"))).toBe(true);
  expect(existsSync(join(outDir, "resources", "char.def"))).toBe(true);
  expect(existsSync(join(outDir, "resources", "rewrite.def"))).toBe(true);
  expect(existsSync(join(outDir, "resources", "unk.def"))).toBe(true);
  expect(fetchSpy).toHaveBeenCalled();
  expect(spawnSpy).not.toHaveBeenCalled();
});

test("custom wheel extracts to canonical path and ignores traversal-like entry", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "sudachi-dict-wheel-custom-"));
  const payload = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
  spyOn(globalThis, "fetch").mockImplementation(createBinaryOkFetch(payload));
  mockUnzipFlow(["../../outside.dic", "sudachidict_core/resources/system.dic"]);
  spyOn(console, "log").mockImplementation(() => {});

  const result = await setupDictionary({
    type: "core",
    version: "latest",
    outDir,
    url: "https://example.com/SudachiDict_core-20260723-py3-none-any.whl",
  });
  expect(result.version).toBe("20260723");
  expect(result.dictPath).toBe(
    join(outDir, "sudachi-dictionary-20260723", "system_core.dic"),
  );
  expect(existsSync(join(outDir, "outside.dic"))).toBe(false);
});

test("wheel with mismatched package path is rejected", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "sudachi-dict-wheel-mismatch-"));
  spyOn(globalThis, "fetch").mockImplementation(
    createBinaryOkFetch(new Uint8Array([1])),
  );
  mockUnzipFlow(["sudachidict_small/resources/system.dic"]);
  spyOn(console, "log").mockImplementation(() => {});
  await expect(
    setupDictionary({
      type: "core",
      version: "latest",
      outDir,
      url: "https://example.com/sudachidict_core-20260723-py3-none-any.whl",
    }),
  ).rejects.toThrow("does not contain a dictionary file");
});

test("failed wheel extraction preserves existing target and cleans temporary file", async () => {
  const outDir = mkdtempSync(join(tmpdir(), "sudachi-dict-wheel-failure-"));
  const targetDir = join(outDir, "sudachi-dictionary-20260723");
  const target = join(targetDir, "system_core.dic");
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(target, "existing");
  spyOn(globalThis, "fetch").mockImplementation(
    createBinaryOkFetch(new Uint8Array([1])),
  );
  spyOn(Bun, "spawn").mockImplementation((input: unknown) => {
    const args = Array.isArray(input)
      ? input
      : ((input as { cmd?: string[] }).cmd ?? []);
    if (args[1] === "-Z1")
      return {
        exited: Promise.resolve(0),
        stdout: "sudachidict_core/resources/system.dic\n",
      } as never;
    if (args[1] === "-p")
      return {
        exited: Promise.resolve(1),
        stdout: new Response("").body,
      } as never;
    throw new Error(`unexpected Bun.spawn args: ${args.join(" ")}`);
  });
  spyOn(console, "log").mockImplementation(() => {});
  await expect(
    setupDictionary({
      type: "core",
      version: "latest",
      outDir,
      url: "https://example.com/sudachidict_core-20260723-py3-none-any.whl",
    }),
  ).rejects.toThrow("Failed to extract dictionary entry");
  expect(readFileSync(target, "utf8")).toBe("existing");
  expect(
    readdirSync(targetDir).filter((name) => name.includes(".tmp-")).length,
  ).toBe(0);
});
