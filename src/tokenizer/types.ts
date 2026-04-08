export const TOKENIZE_MODES = ["A", "B", "C"] as const;

export type TokenizeMode = (typeof TOKENIZE_MODES)[number];

export interface TokenizerLoadOptions {
  dictPath: string;
  configPath?: string;
  libraryPath?: string;
}

export type TokenizerOptions = TokenizerLoadOptions;

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
}

export type NativeSudachiErrorCode =
  | "OK"
  | "NULL_POINTER"
  | "INVALID_UTF8"
  | "INVALID_MODE"
  | "CONFIG"
  | "TOKENIZE"
  | "INTERNAL"
  | "UNKNOWN";

export type SudachiErrorCode =
  | NativeSudachiErrorCode
  | "INVALID_ARGUMENT"
  | "LAYOUT_MISMATCH"
  | "MISSING_ARGUMENT"
  | "TOKENIZER_CLOSED";

export interface SudachiErrorOptions {
  code: SudachiErrorCode;
  nativeStatus?: number | null;
}

export class SudachiError extends Error {
  readonly code: SudachiErrorCode;
  readonly nativeStatus: number | null;

  constructor(message: string, options: SudachiErrorOptions) {
    super(message);
    this.name = "SudachiError";
    this.code = options.code;
    this.nativeStatus = options.nativeStatus ?? null;
  }
}

export function isTokenizeMode(value: string): value is TokenizeMode {
  return TOKENIZE_MODES.includes(value as TokenizeMode);
}

export function parseTokenizeMode(value: string): TokenizeMode {
  if (isTokenizeMode(value)) {
    return value;
  }

  throw new SudachiError(`Invalid mode: ${value}`, {
    code: "INVALID_MODE",
    nativeStatus: 3,
  });
}

export function formatSudachiError(error: unknown): string {
  if (error instanceof SudachiError) {
    return `[${error.code}] ${error.message}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
