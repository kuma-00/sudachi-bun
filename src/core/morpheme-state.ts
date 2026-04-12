import type { Morpheme, TokenizeMode } from "../types.ts";
import { SudachiError } from "../types.ts";

export type MorphemeListStateKind = "owned" | "split";

export interface MorphemeListState {
  tokenizer: object;
  text: string;
  mode: TokenizeMode;
  kind: MorphemeListStateKind;
  signatures: readonly string[];
}

export interface MorphemeState {
  listState: MorphemeListState;
  index: number;
}

const MORPHEME_LIST_STATE = new WeakMap<
  readonly Morpheme[],
  MorphemeListState
>();
const MORPHEME_STATE = new WeakMap<Morpheme, MorphemeState>();

export class MorphemeStateTracker {
  attach(
    tokenizer: object,
    morphemes: Morpheme[],
    text: string,
    mode: TokenizeMode,
    kind: MorphemeListStateKind,
  ): Morpheme[] {
    const signatures = morphemes.map((morpheme) =>
      this.#morphemeSignature(morpheme),
    );
    const listState: MorphemeListState = {
      tokenizer,
      text,
      mode,
      kind,
      signatures,
    };

    MORPHEME_LIST_STATE.set(morphemes, listState);

    for (const [index, morpheme] of morphemes.entries()) {
      MORPHEME_STATE.set(morpheme, {
        listState,
        index,
      });
    }

    return morphemes;
  }

  getListState(morphemes: readonly Morpheme[]): MorphemeListState | undefined {
    return MORPHEME_LIST_STATE.get(morphemes);
  }

  getMorphemeState(tokenizer: object, morpheme: Morpheme): MorphemeState {
    const morphemeState = MORPHEME_STATE.get(morpheme);
    if (
      morphemeState === undefined ||
      morphemeState.listState.tokenizer !== tokenizer
    ) {
      throw new SudachiError("Morpheme was not created by this tokenizer.", {
        code: "INVALID_ARGUMENT",
      });
    }

    return morphemeState;
  }

  canUseWholeListSplit(
    morphemes: readonly Morpheme[],
    listState: MorphemeListState,
  ): boolean {
    if (listState.kind !== "owned") {
      return false;
    }

    if (morphemes.length !== listState.signatures.length) {
      return false;
    }

    for (let index = 0; index < morphemes.length; index += 1) {
      const morpheme = morphemes[index];
      const expectedSignature = listState.signatures[index];
      if (morpheme === undefined || expectedSignature === undefined) {
        return false;
      }

      if (this.#morphemeSignature(morpheme) !== expectedSignature) {
        return false;
      }
    }

    return true;
  }

  #morphemeSignature(morpheme: Morpheme): string {
    return [
      morpheme.surface,
      morpheme.normalized,
      morpheme.dictionaryForm,
      morpheme.reading,
      morpheme.pos,
      morpheme.begin,
      morpheme.end,
      morpheme.beginChar,
      morpheme.endChar,
      morpheme.wordId,
      morpheme.posId,
      morpheme.dictionaryId,
      morpheme.isOov ? 1 : 0,
      morpheme.synonymGroupIds.join(","),
    ].join("\u0001");
  }
}
