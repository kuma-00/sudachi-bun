import { expect, test } from "bun:test";

const { createPretokenizer, main, PosMatcher, runCli } = await import("../index.ts");

test("package root exports the CLI entrypoint", () => {
  expect(typeof main).toBe("function");
  expect(typeof runCli).toBe("function");
  expect(typeof PosMatcher).toBe("function");
  expect(typeof createPretokenizer).toBe("function");
});
