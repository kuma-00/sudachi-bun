import { createTokenizer, type Tokenizer } from "./core.ts";
import { createSentenceSplitter, type SentenceSplitter } from "./sentence-splitter.ts";
import { createPretokenizer, type Pretokenizer } from "./pretokenizer.ts";
import type { PretokenizerOptions, SentenceSplitterOptions, TokenizerOptions } from "./types.ts";

export interface CreateSudachiOptions extends TokenizerOptions {
  splitter?: SentenceSplitterOptions;
  pretokenizer?: PretokenizerOptions;
}

export interface Sudachi {
  tokenizer: Tokenizer;
  splitter: SentenceSplitter;
  pretokenizer: Pretokenizer;
  close(): void;
  [Symbol.dispose](): void;
}

class SudachiInstance implements Sudachi {
  readonly tokenizer: Tokenizer;
  readonly splitter: SentenceSplitter;
  readonly pretokenizer: Pretokenizer;

  constructor(tokenizer: Tokenizer, splitter: SentenceSplitter, pretokenizer: Pretokenizer) {
    this.tokenizer = tokenizer;
    this.splitter = splitter;
    this.pretokenizer = pretokenizer;
  }

  close(): void {
    const errors: unknown[] = [];

    for (const resource of [this.pretokenizer, this.splitter, this.tokenizer]) {
      try {
        resource.close();
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      throw errors[0];
    }
  }

  [Symbol.dispose](): void {
    this.close();
  }
}

export function createSudachi(options: CreateSudachiOptions): Sudachi {
  const tokenizer = createTokenizer(options);

  try {
    const splitter = createSentenceSplitter(options.splitter ?? options);

    try {
      const pretokenizer = createPretokenizer(options.pretokenizer ?? options);
      return new SudachiInstance(tokenizer, splitter, pretokenizer);
    } catch (error) {
      splitter.close();
      throw error;
    }
  } catch (error) {
    tokenizer.close();
    throw error;
  }
}
