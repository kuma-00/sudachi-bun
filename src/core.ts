import {
  type LookupEntry,
  type Morpheme,
  type PosMatcherPatterns,
  type TokenizeMode,
  type TokenizerOptions,
} from "./types.ts";
import { MorphemeStateTracker } from "./core/morpheme-state.ts";
import { compilePosMatcher, lookupEntries, splitMorpheme, splitMorphemes, tokenizeMorphemes } from "./core/operations.ts";
import { TokenizerSessionManager } from "./core/session.ts";

export class PosMatcher {
  #posIds: Set<number>;

  constructor(posIds: readonly number[]) {
    this.#posIds = new Set(posIds);
  }

  matches(posId: number): boolean;
  matches(morpheme: Morpheme): boolean;
  matches(entry: LookupEntry): boolean;
  matches(value: number | Morpheme | LookupEntry): boolean {
    if (typeof value === "number") {
      return this.#posIds.has(value);
    }

    return typeof value.posId === "number" && this.#posIds.has(value.posId);
  }

  filter<T extends { posId?: number }>(items: readonly T[]): T[] {
    return items.filter((item) => typeof item.posId === "number" && this.#posIds.has(item.posId));
  }
}

export class Tokenizer {
  #session: TokenizerSessionManager;
  #state: MorphemeStateTracker;

  constructor(session: TokenizerSessionManager, state: MorphemeStateTracker) {
    this.#session = session;
    this.#state = state;
  }

  get closed(): boolean {
    return this.#session.closed;
  }

  tokenize(text: string, mode: TokenizeMode = "C"): Morpheme[] {
    return tokenizeMorphemes(this.#context(), text, mode);
  }

  lookup(surface: string): LookupEntry[] {
    return lookupEntries(this.#context(), surface);
  }

  createPosMatcher(patterns: PosMatcherPatterns): PosMatcher {
    return new PosMatcher(compilePosMatcher(this.#context(), patterns));
  }

  split(morpheme: Morpheme, mode: TokenizeMode = "C"): Morpheme[] {
    return splitMorpheme(this.#context(), morpheme, mode);
  }

  splitInto(morphemes: readonly Morpheme[], mode: TokenizeMode = "C"): Morpheme[] {
    return splitMorphemes(this.#context(), morphemes, mode);
  }

  close(): void {
    this.#session.close();
  }

  [Symbol.dispose](): void {
    this.close();
  }

  #context(): { owner: object; session: TokenizerSessionManager; state: MorphemeStateTracker } {
    return {
      owner: this,
      session: this.#session,
      state: this.#state,
    };
  }
}

export function createTokenizer(options: TokenizerOptions): Tokenizer {
  return new Tokenizer(new TokenizerSessionManager(options), new MorphemeStateTracker());
}
