import { createTokenizer } from "../core.ts";
import { createSentenceSplitter } from "../sentence-splitter.ts";
import { formatSudachiError, type Morpheme, type SentenceSpan, type SurfaceProjection, type TokenizeMode } from "../types.ts";
import { formatTokenizeOutput, type TokenizeOutputFormat } from "./output.ts";

import type { TokenizeCliCommand } from "./normalize.ts";

interface CliIO {
  error(message: string): void;
}

function tokenizeSentenceUnits(
  tokenizer: { tokenize(params: { text: string; projection: SurfaceProjection; mode?: TokenizeMode }): Morpheme[] },
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

  const morphemes: Morpheme[] = [];
  for (const unit of units) {
    const unitMorphemes = tokenizer.tokenize({ text: unit.text, projection, mode });
    if (unit.start === 0) {
      morphemes.push(...unitMorphemes);
      continue;
    }

    morphemes.push(
      ...unitMorphemes.map((morpheme) => ({
        ...morpheme,
        begin: morpheme.begin + unit.start,
        end: morpheme.end + unit.start,
      })),
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
  const splitter = command.splitSentences ? createSentenceSplitter(command) : null;

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
        io?.error(`[debug] lookup=${JSON.stringify(tokenizer.lookup({ surface: command.text, projection: command.projection }))}`);
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
