import { suffix } from "bun:ffi";
import { afterEach, expect, mock, test } from "bun:test";

import { resolveBinaryFileName, resolveRepoSlug } from "./setup-native.ts";

afterEach(() => {
  mock.restore();
});

test("resolveBinaryFileName returns the default library name when env is unset", () => {
  expect(resolveBinaryFileName({})).toBe(`libsudachi_ffi.${suffix}`);
});

test("resolveBinaryFileName returns explicit binary name", () => {
  expect(
    resolveBinaryFileName({
      SUDACHI_FFI_BINARY_NAME: "custom-native-binary.dylib",
    }),
  ).toBe("custom-native-binary.dylib");
});

test("resolveBinaryFileName rejects directory segments", () => {
  expect(() =>
    resolveBinaryFileName({
      SUDACHI_FFI_BINARY_NAME: "../libsudachi_ffi.dylib",
    }),
  ).toThrow("must be a file name");

  expect(() =>
    resolveBinaryFileName({
      SUDACHI_FFI_BINARY_NAME: "nested\\libsudachi_ffi.dylib",
    }),
  ).toThrow("must be a file name");
});

test("resolveBinaryFileName rejects dot segments", () => {
  expect(() =>
    resolveBinaryFileName({
      SUDACHI_FFI_BINARY_NAME: ".",
    }),
  ).toThrow("must be a file name");

  expect(() =>
    resolveBinaryFileName({
      SUDACHI_FFI_BINARY_NAME: "..",
    }),
  ).toThrow("must be a file name");
});

test("resolveRepoSlug prefers SUDACHI_FFI_GITHUB_REPOSITORY", () => {
  expect(
    resolveRepoSlug({
      SUDACHI_FFI_GITHUB_REPOSITORY: "example/native-releases",
      GITHUB_REPOSITORY: "example/ignored",
    }),
  ).toBe("example/native-releases");
});

test("resolveRepoSlug falls back to GITHUB_REPOSITORY", () => {
  expect(
    resolveRepoSlug({
      GITHUB_REPOSITORY: "example/from-github-env",
    }),
  ).toBe("example/from-github-env");
});

test("resolveRepoSlug falls back to default when env is unavailable", () => {
  expect(resolveRepoSlug({})).toBe("kuma-00/sudachi-bun");
});
