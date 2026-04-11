import { SudachiError, type PretokenizeOptions, type PretokenizedResult, type PretokenizedToken } from "./types.ts";

export type HfOffsets = readonly [number, number];
export type HfPretokenizedToken = readonly [string, HfOffsets];

export interface HfPretokenizerLike {
  pretokenize(text: string): PretokenizedResult;
}

export interface HfNormalizedStringLike {
  toString(): string;
  slice(begin: number, end: number): HfNormalizedStringLike;
}

export interface HfPreTokenizedStringLike {
  split(
    callback: (index: number, normalized: HfNormalizedStringLike) => HfNormalizedStringLike[],
  ): void;
}

export interface HfPretokenizerAdapter {
  pre_tokenize_str(text: string): HfPretokenizedToken[];
  pre_tokenize_text(text: string): HfPretokenizedToken[];
  pre_tokenize(pretok: HfPreTokenizedStringLike): void;
}

export function ensureHfPretokenizeOptions(options: PretokenizeOptions): PretokenizeOptions {
  const fields = options.subset?.fields;
  if (fields === undefined || fields.includes("surface")) {
    return options;
  }

  return {
    ...options,
    subset: {
      ...options.subset,
      fields: [...fields, "surface"],
    },
  };
}

function toHfPretokenizedToken(token: PretokenizedToken): HfPretokenizedToken {
  const offsets = [token.beginChar, token.endChar] as const;
  return [token.surface, offsets] as const;
}

export function toHfPretokenizedTokens(
  tokens: readonly PretokenizedToken[],
): HfPretokenizedToken[] {
  return tokens.map((token) => toHfPretokenizedToken(token));
}

function assertSurfaceProjectionForHfPipeline(options: PretokenizeOptions | undefined): void {
  const projection = options?.projection;
  if (projection === undefined || projection === "surface") {
    return;
  }

  throw new SudachiError(
    [
      "HuggingFace pre_tokenize(pretok) only supports surface projection.",
      `Configured projection: ${projection}.`,
      "Use pre_tokenize_str() or pre_tokenize_text() when you need projected token text.",
    ].join(" "),
    {
      code: "INVALID_ARGUMENT",
    },
  );
}

export function createHfPretokenizerAdapter(
  pretokenizer: HfPretokenizerLike,
  options?: PretokenizeOptions,
): HfPretokenizerAdapter {
  const transform = (text: string): HfPretokenizedToken[] =>
    toHfPretokenizedTokens(pretokenizer.pretokenize(text));

  const preTokenize = (pretok: HfPreTokenizedStringLike): void => {
    assertSurfaceProjectionForHfPipeline(options);
    pretok.split((_index, normalized) => {
      const text = normalized.toString();
      return toHfPretokenizedTokens(pretokenizer.pretokenize(text)).map((token) =>
        normalized.slice(token[1][0], token[1][1]),
      );
    });
  };

  return {
    pre_tokenize_str: transform,
    pre_tokenize_text: transform,
    pre_tokenize: preTokenize,
  };
}
