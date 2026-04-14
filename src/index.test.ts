import { expect, test } from "bun:test";

const pkg = await import("../index.ts");

test("package root exports the new API entrypoint", () => {
  expect("createSudachi" in pkg).toBe(true);
  expect(typeof pkg.main).toBe("function");
  expect(typeof pkg.runCli).toBe("function");
  expect(typeof pkg.createSudachi).toBe("function");
  expect(typeof pkg.createHuggingFacePretokenizer).toBe("function");
  expect(typeof pkg.inspectDictionaryBytes).toBe("function");
  expect(typeof pkg.buildSystemDictionary).toBe("function");
  expect(typeof pkg.buildUserDictionary).toBe("function");
});

test("package root no longer exports legacy create* APIs", () => {
  expect("createTokenizer" in pkg).toBe(false);
  expect("createSentenceSplitter" in pkg).toBe(false);
  expect("createPretokenizer" in pkg).toBe(false);
});
