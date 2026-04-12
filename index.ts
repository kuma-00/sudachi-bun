export { createSudachi } from "./src/sudachi.ts";
import type { Pretokenizer } from "./src/pretokenizer.ts";
import {
  createHfPretokenizerAdapter,
  ensureHfPretokenizeOptions,
  type HfPretokenizedToken,
  type HfPretokenizerAdapter,
} from "./src/pretokenizer-hf.ts";
import { main as runMain } from "./src/cli.ts";
import type { PretokenizeOptions, PretokenizedResult } from "./src/types.ts";

export { runCli } from "./src/cli.ts";
export { runMain as main };
export { runTokenizeCommand } from "./src/cli/execute.ts";
export { parseCliArgs } from "./src/cli/parser.ts";
export { formatSudachiError, SudachiError, TOKENIZE_MODES } from "./src/types.ts";
export type {
  CreateSudachiOptions,
  Sudachi,
} from "./src/sudachi.ts";
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
  PretokenizeOptions,
  PretokenizedResult,
  PretokenizedToken,
  PretokenizerOptions,
  SurfaceProjection,
  SudachiErrorCode,
  TokenizeMode,
  TokenizerOptions,
} from "./src/types.ts";
export type { HfOffsets, HfPretokenizedToken, HfPretokenizerAdapter } from "./src/pretokenizer-hf.ts";
export type { HfNormalizedStringLike, HfPreTokenizedStringLike } from "./src/pretokenizer-hf.ts";

export interface HuggingFacePretokenizerAdapter extends HfPretokenizerAdapter {
  readonly pretokenizer: Pretokenizer;
  readonly options: PretokenizeOptions;
  pre_tokenize_str(text: string): HfPretokenizedToken[];
  pre_tokenize(pretok: Parameters<HfPretokenizerAdapter["pre_tokenize"]>[0]): void;
}

export function createHuggingFacePretokenizer(
  pretokenizer: Pretokenizer,
  options: PretokenizeOptions = {},
): HuggingFacePretokenizerAdapter {
  const pretokenizeOptions = ensureHfPretokenizeOptions({
    projection: "surface",
    ...options,
  });
  const adapter = createHfPretokenizerAdapter(
    {
      pretokenize(text: string): PretokenizedResult {
        return pretokenizer.pretokenize(text, pretokenizeOptions);
      },
    },
    pretokenizeOptions,
  );

  return {
    pretokenizer,
    options,
    ...adapter,
  };
}

if (import.meta.main) {
  runMain();
}
