export { createTokenizer, Tokenizer } from "./src/core.ts";
export { main, runCli, runTokenizeCommand } from "./src/cli.ts";
export { createSentenceSplitter, SentenceSplitter } from "./src/sentence-splitter.ts";
export { parseCliArgs } from "./src/cli/parser.ts";
export { formatSudachiError, SudachiError, TOKENIZE_MODES } from "./src/types.ts";
export type {
  LookupEntry,
  Morpheme,
  NativeSudachiErrorCode,
  SentenceSpan,
  SentenceSplitterLoadOptions,
  SudachiErrorCode,
  TokenizeMode,
  TokenizerLoadOptions,
  TokenizerOptions,
} from "./src/types.ts";

if (import.meta.main) {
  const { main } = await import("./src/cli.ts");
  main();
}
