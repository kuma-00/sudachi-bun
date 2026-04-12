import {
  type CreatePosMatcherArgs,
  type InfoSubset,
  type LookupArgs,
  type LookupEntry,
  type Morpheme,
  type SplitArgs,
  type SplitIntoArgs,
  type SurfaceProjection,
  type TokenizeArgs,
  type TokenizeMode,
  type TokenizerOptions,
} from "./types.ts";
import { MorphemeStateTracker } from "./core/morpheme-state.ts";
import { compilePosMatcher, lookupEntries, splitMorpheme, splitMorphemes, tokenizeMorphemes } from "./core/operations.ts";
import { TokenizerSessionManager } from "./core/session.ts";

export { Pretokenizer, createPretokenizer } from "./pretokenizer.ts";

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

  tokenize({ text, projection, mode = "C", subset }: TokenizeArgs): Morpheme[] {
    return tokenizeMorphemes(this.#context(), text, projection, mode, subset);
  }

  lookup({ surface, projection, subset }: LookupArgs): LookupEntry[] {
    return lookupEntries(this.#context(), surface, projection, subset);
  }

  createPosMatcher({ patterns }: CreatePosMatcherArgs): PosMatcher {
    return new PosMatcher(compilePosMatcher(this.#context(), patterns));
  }

  split({ morpheme, projection, mode = "C" }: SplitArgs): Morpheme[] {
    return splitMorpheme(this.#context(), morpheme, projection, mode);
  }

  splitInto({ morphemes, projection, mode = "C" }: SplitIntoArgs): Morpheme[] {
    return splitMorphemes(this.#context(), morphemes, projection, mode);
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
