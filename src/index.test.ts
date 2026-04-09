import { expect, test } from "bun:test";

import { main, PosMatcher, runCli } from "../index.ts";

test("package root exports the CLI entrypoint", () => {
  expect(typeof main).toBe("function");
  expect(typeof runCli).toBe("function");
  expect(typeof PosMatcher).toBe("function");
});
