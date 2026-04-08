export type TokenizeMode = "A" | "B" | "C";

export interface TokenizerOptions {
  dictPath: string;
  configPath?: string;
  libraryPath?: string;
}

export interface Morpheme {
  surface: string;
  normalized: string;
  dictionaryForm: string;
  reading: string;
  pos: string;
  begin: number;
  end: number;
  wordId: string;
  posId: number;
  dictionaryId: number;
  isOov: boolean;
  synonymGroupIds: number[];
  detailJson: string;
  details: Record<string, unknown> | null;
  detailParseError?: string;
}

export class SudachiError extends Error {
  constructor(
    message: string,
    public readonly code: number,
  ) {
    super(message);
    this.name = "SudachiError";
  }
}
