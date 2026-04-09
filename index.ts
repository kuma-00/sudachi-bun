export { createTokenizer, Tokenizer } from "./src/core.ts";
export { main, parseCliArgs, parseArgValue, runCli, runTokenizeCommand } from "./src/cli.ts";
export { formatSudachiError, SudachiError } from "./src/types.ts";
export type {
  Morpheme,
  NativeSudachiErrorCode,
  SudachiErrorCode,
  TokenizeMode,
  TokenizerLoadOptions,
  TokenizerOptions,
} from "./src/types.ts";

if (import.meta.main) {
  const { main } = await import("./src/cli.ts");
  main();
}
