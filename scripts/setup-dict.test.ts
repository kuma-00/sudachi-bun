import { expect, test } from "bun:test";

import {
  buildExpectedAssetName,
  parseSetupDictionaryArgs,
  resolveDictionaryAsset,
  type DictionaryType,
} from "./setup-dict.ts";

test("parseSetupDictionaryArgs supports inline values", () => {
  expect(
    parseSetupDictionaryArgs(["--type=full", "--version=v20260116", "--out=./cache", "--url=https://example.com/dict.zip"]),
  ).toEqual({
    type: "full",
    version: "v20260116",
    outDir: "./cache",
    url: "https://example.com/dict.zip",
  });
});

test("buildExpectedAssetName strips the v prefix from release tags", () => {
  expect(buildExpectedAssetName("core", "v20260116")).toBe("sudachi-dictionary-20260116-core.zip");
});

test("resolveDictionaryAsset matches the expected asset name", () => {
  const asset = resolveDictionaryAsset(
    {
      tag_name: "v20260116",
      assets: [
        { name: "sudachi-dictionary-20260116-core.zip", browser_download_url: "https://example.com/core.zip" },
        { name: "sudachi-dictionary-20260116-full.zip", browser_download_url: "https://example.com/full.zip" },
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
        assets: [{ name: "other.zip", browser_download_url: "https://example.com/other.zip" }],
      },
      "small" as DictionaryType,
    ),
  ).toThrow("Expected: sudachi-dictionary-20260116-small.zip");
});
