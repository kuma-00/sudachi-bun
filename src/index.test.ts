import { expect, test } from "bun:test";

import { main, runCli } from "../index.ts";

test("package root exports the CLI entrypoint", () => {
  expect(typeof main).toBe("function");
  expect(typeof runCli).toBe("function");
});
