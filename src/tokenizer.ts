export { createTokenizer, Tokenizer } from "./tokenizer/core.ts";
export { main, parseCliArgs, parseArgValue, runCli, runTokenizeCommand } from "./tokenizer/cli.ts";
export { formatSudachiError, SudachiError } from "./tokenizer/types.ts";
export type {
  Morpheme,
  NativeSudachiErrorCode,
  SudachiErrorCode,
  TokenizeMode,
  TokenizerLoadOptions,
  TokenizerOptions,
} from "./tokenizer/types.ts";

if (import.meta.main) {
  const { main } = await import("./tokenizer/cli.ts");
  main();
}
