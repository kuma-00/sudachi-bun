import {
  type InfoSubsetField,
  type PretokenizedResult,
  type PretokenizedToken,
  type PretokenizeOptions,
  SudachiError,
} from "./types.ts";

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
    callback: (
      index: number,
      normalized: HfNormalizedStringLike,
    ) => HfNormalizedStringLike[],
  ): void;
}

export interface HfPretokenizerAdapter {
  pre_tokenize_str(text: string): HfPretokenizedToken[];
  pre_tokenize_text(text: string): HfPretokenizedToken[];
  pre_tokenize(pretok: HfPreTokenizedStringLike): void;
}

export type HfTokenTransformPath =
  | "pre_tokenize_str"
  | "pre_tokenize_text"
  | "pre_tokenize";

export type HfPretokenizedTokenHandler = (
  tokens: PretokenizedResult,
) => PretokenizedResult;

export const HF_PRETOKENIZER_ALL_SUBSET_FIELDS = [
  "surface",
  "headWordLength",
  "pos",
  "posId",
  "normalized",
  "dictionaryForm",
  "reading",
  "splitA",
  "splitB",
  "wordStructure",
  "synonymGroupIds",
] as const satisfies readonly InfoSubsetField[];

export function ensureHfPretokenizeOptions(
  options: PretokenizeOptions,
  requiredFields: readonly InfoSubsetField[] = [],
): PretokenizeOptions {
  const fields = options.subset?.fields;
  const mergedRequiredFields = [
    ...new Set<InfoSubsetField>(["surface", ...requiredFields]),
  ];
  if (fields === undefined) {
    if (requiredFields.length === 0) {
      return options;
    }
    return {
      ...options,
      subset: {
        ...options.subset,
        fields: [...mergedRequiredFields],
      },
    };
  }

  const missingFields = mergedRequiredFields.filter(
    (field) => !fields.includes(field),
  );
  if (missingFields.length === 0) {
    return options;
  }

  return {
    ...options,
    subset: {
      ...options.subset,
      fields: [...fields, ...missingFields],
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

function assertSurfaceProjectionForHfPipeline(
  options: PretokenizeOptions | undefined,
): void {
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
  handler?: HfPretokenizedTokenHandler,
): HfPretokenizerAdapter {
  const transformTokens = (
    text: string,
    path: HfTokenTransformPath,
  ): PretokenizedResult => {
    const tokens = pretokenizer.pretokenize(text);
    if (handler === undefined) {
      return tokens;
    }

    try {
      const transformed = handler(tokens);
      if (!Array.isArray(transformed)) {
        throw new SudachiError(
          `HuggingFace pretokenizer handler must return an array of tokens in ${path}.`,
          {
            code: "INVALID_ARGUMENT",
          },
        );
      }
      return transformed;
    } catch (error) {
      if (error instanceof SudachiError) {
        throw new SudachiError(
          `HuggingFace pretokenizer handler failed in ${path}: ${error.message}`,
          {
            code: error.code,
            nativeStatus: error.nativeStatus,
          },
        );
      }
      if (error instanceof Error) {
        throw new SudachiError(
          `HuggingFace pretokenizer handler failed in ${path}: ${error.message}`,
          {
            code: "INVALID_ARGUMENT",
          },
        );
      }
      throw new SudachiError(
        `HuggingFace pretokenizer handler failed in ${path} with a non-error throw value.`,
        {
          code: "INTERNAL",
        },
      );
    }
  };

  const transform = (
    text: string,
    path: Extract<
      HfTokenTransformPath,
      "pre_tokenize_str" | "pre_tokenize_text"
    >,
  ): HfPretokenizedToken[] =>
    toHfPretokenizedTokens(transformTokens(text, path));

  const preTokenize = (pretok: HfPreTokenizedStringLike): void => {
    assertSurfaceProjectionForHfPipeline(options);
    pretok.split((_index, normalized) => {
      const text = normalized.toString();
      return toHfPretokenizedTokens(transformTokens(text, "pre_tokenize")).map(
        (token) => normalized.slice(token[1][0], token[1][1]),
      );
    });
  };

  return {
    pre_tokenize_str(text: string): HfPretokenizedToken[] {
      return transform(text, "pre_tokenize_str");
    },
    pre_tokenize_text(text: string): HfPretokenizedToken[] {
      return transform(text, "pre_tokenize_text");
    },
    pre_tokenize: preTokenize,
  };
}
