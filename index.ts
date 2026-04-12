export { createSudachi } from "./src/sudachi.ts";

import { main as runMain } from "./src/cli.ts";
import type { Pretokenizer } from "./src/pretokenizer.ts";
import {
  createHfPretokenizerAdapter,
  ensureHfPretokenizeOptions,
  type HfPretokenizedToken,
  type HfPretokenizerAdapter,
} from "./src/pretokenizer-hf.ts";
import type { PretokenizedResult, PretokenizeOptions } from "./src/types.ts";

export { runTokenizeCommand } from "./src/cli/execute.ts";
export { parseCliArgs } from "./src/cli/parser.ts";
export { runCli } from "./src/cli.ts";
export type {
  DictionaryDownload,
  DictionarySetupResult,
  DictionaryType,
  EnsureDictionaryOptions,
  InstalledDictionary,
  SetupDictionaryOptions,
} from "./src/dictionary.ts";
export {
  ensureDictionary,
  findInstalledDictionary,
  listInstalledDictionaries,
  setupDictionary,
} from "./src/dictionary.ts";
export type {
  HfNormalizedStringLike,
  HfOffsets,
  HfPreTokenizedStringLike,
  HfPretokenizedToken,
  HfPretokenizerAdapter,
} from "./src/pretokenizer-hf.ts";
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
  NativeLibraryLoadOptions,
  NativeSudachiErrorCode,
  PosMatcherPattern,
  PosMatcherPatterns,
  PretokenizedResult,
  PretokenizedToken,
  PretokenizeOptions,
  PretokenizerOptions,
  SentenceSpan,
  SentenceSplitterOptions,
  SudachiErrorCode,
  SurfaceProjection,
  TokenizeMode,
  TokenizerOptions,
} from "./src/types.ts";
export {
  formatSudachiError,
  SudachiError,
  TOKENIZE_MODES,
} from "./src/types.ts";
export { runMain as main };

export interface HuggingFacePretokenizerAdapter extends HfPretokenizerAdapter {
  readonly pretokenizer: Pretokenizer;
  readonly options: PretokenizeOptions;
  pre_tokenize_str(text: string): HfPretokenizedToken[];
  pre_tokenize(
    pretok: Parameters<HfPretokenizerAdapter["pre_tokenize"]>[0],
  ): void;
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
