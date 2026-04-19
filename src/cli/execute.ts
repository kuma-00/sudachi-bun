import { createTokenizer } from "../core.ts";
import { createSentenceSplitter } from "../sentence-splitter.ts";
import { createUtf8ByteOffsetIndexMap } from "../shared/utf8-offset.ts";
import {
  formatSudachiError,
  type Morpheme,
  type SentenceSpan,
  SudachiError,
  type SurfaceProjection,
  type TokenizeMode,
} from "../types.ts";
import type { TokenizeCliCommand } from "./normalize.ts";
import { formatTokenizeOutput, type TokenizeOutputFormat } from "./output.ts";

interface CliIO {
  error(message: string): void;
}

function invalidSentenceSplitResult(message: string): never {
  throw new SudachiError(message, {
    code: "INTERNAL",
    nativeStatus: 255,
  });
}

function tokenizeSentenceUnits(
  tokenizer: {
    tokenize(params: {
      text: string;
      projection: SurfaceProjection;
      mode?: TokenizeMode;
    }): Morpheme[];
  },
  splitter: { split(text: string): SentenceSpan[] } | null,
  text: string,
  projection: TokenizeCliCommand["projection"],
  mode: TokenizeMode,
  splitSentences: boolean,
): Morpheme[] {
  if (!splitSentences || splitter === null) {
    return tokenizer.tokenize({ text, projection, mode });
  }

  const units = splitter.split(text);
  if (units.length === 0) {
    return tokenizer.tokenize({ text, projection, mode });
  }

  const startOffsets = units.map((unit) => unit.start);
  const startIndexMap = createUtf8ByteOffsetIndexMap(text, startOffsets, {
    throwInvalid: (message) => invalidSentenceSplitResult(message),
    messages: {
      outOfRange: (offset) =>
        `Sentence splitter returned an out-of-range byte offset: ${offset}.`,
      notBoundary: (offset) =>
        `Sentence splitter returned a byte offset that does not align to a UTF-8 boundary: ${offset}.`,
    },
  });

  const morphemes: Morpheme[] = [];
  for (const unit of units) {
    const startChar = startIndexMap.get(unit.start);
    if (startChar === undefined) {
      invalidSentenceSplitResult(
        `Sentence splitter returned an unreadable unit boundary: ${unit.start}.`,
      );
    }

    const unitMorphemes = tokenizer.tokenize({
      text: unit.text,
      projection,
      mode,
    });
    morphemes.push(
      ...unitMorphemes.map((morpheme) => {
        const adjusted = Object.create(
          Object.getPrototypeOf(morpheme),
          Object.getOwnPropertyDescriptors(morpheme),
        ) as Morpheme;
        adjusted.begin = morpheme.begin + unit.start;
        adjusted.end = morpheme.end + unit.start;
        adjusted.beginChar = morpheme.beginChar + startChar;
        adjusted.endChar = morpheme.endChar + startChar;
        return adjusted;
      }),
    );
  }

  return morphemes;
}

export function runTokenizeCommand(
  command: TokenizeCliCommand,
  format: TokenizeOutputFormat = "normal",
  io?: Pick<CliIO, "error">,
): string {
  const tokenizer = createTokenizer(command);
  const splitter = command.splitSentences
    ? createSentenceSplitter(command)
    : null;

  try {
    if (command.debug) {
      io?.error(
        [
          `[debug] tokenize`,
          `format=${format}`,
          `projection=${command.projection}`,
          `splitSentences=${command.splitSentences ? "true" : "false"}`,
          `resourceDir=${command.resourceDir ?? "(default)"}`,
        ].join(" "),
      );

      try {
        io?.error(
          `[debug] lookup=${JSON.stringify(tokenizer.lookup({ surface: command.text, projection: command.projection }))}`,
        );
      } catch (error) {
        io?.error(`[debug] lookup-unavailable=${formatSudachiError(error)}`);
      }
    }

    const morphemes = tokenizeSentenceUnits(
      tokenizer,
      splitter,
      command.text,
      command.projection,
      command.mode,
      Boolean(command.splitSentences),
    );

    if (command.debug) {
      io?.error(`[debug] morphemes=${morphemes.length}`);
    }

    return formatTokenizeOutput(morphemes, format, command.projection);
  } finally {
    splitter?.close();
    tokenizer.close();
  }
}
