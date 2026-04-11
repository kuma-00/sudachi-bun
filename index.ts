export { PosMatcher, createTokenizer } from "./src/core.ts";
export { createSentenceSplitter } from "./src/sentence-splitter.ts";
export * from "./src/pretokenizer.ts";
import { main as runMain } from "./src/cli.ts";

export { runCli } from "./src/cli.ts";
export { runMain as main };
export { runTokenizeCommand } from "./src/cli/execute.ts";
export { parseCliArgs } from "./src/cli/parser.ts";
export { formatSudachiError, SudachiError, TOKENIZE_MODES } from "./src/types.ts";
export type {
  InfoSubset,
  InfoSubsetField,
  InfoSubsetFields,
  LookupEntry,
  Morpheme,
  PosMatcherPattern,
  PosMatcherPatterns,
  NativeSudachiErrorCode,
  NativeLibraryLoadOptions,
  SentenceSpan,
  SentenceSplitterOptions,
  SudachiErrorCode,
  TokenizeMode,
  TokenizerOptions,
} from "./src/types.ts";

if (import.meta.main) {
  runMain();
}
