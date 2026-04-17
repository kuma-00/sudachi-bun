export const TOKENIZE_MODES = ["A", "B", "C"] as const;

export type TokenizeMode = (typeof TOKENIZE_MODES)[number];

export const SURFACE_PROJECTIONS = [
  "surface",
  "normalized",
  "dictionary_form",
  "reading",
  "dictionary_and_surface",
  "normalized_and_surface",
  "normalized_nouns",
] as const;

export type SurfaceProjection = (typeof SURFACE_PROJECTIONS)[number];

export interface NativeLibraryLoadOptions {
  libraryPath?: string;
  debug?: boolean;
}

export const DICTIONARY_KINDS = ["system", "user", "unknown"] as const;

export type DictionaryKind = (typeof DICTIONARY_KINDS)[number];

export interface DictionaryBytesInspection {
  dictionaryKind: DictionaryKind;
  headerVersion: number | null;
  loadable: boolean;
}

export interface DictionaryBuildPartReport {
  part: string;
  size: number;
  timeSeconds: number;
  isWrite: boolean;
}

export interface DictionaryBuildResult {
  outputPath: string;
  report: DictionaryBuildPartReport[];
}

export interface BuildSystemDictionaryOptions extends NativeLibraryLoadOptions {
  matrixPath: string;
  lexiconPaths: readonly string[];
  outputPath: string;
  description?: string;
}

export interface BuildUserDictionaryOptions extends NativeLibraryLoadOptions {
  systemDictPath: string;
  lexiconPaths: readonly string[];
  outputPath: string;
  description?: string;
}

export interface TokenizerOptions extends NativeLibraryLoadOptions {
  dictPath: string;
  configPath?: string;
  resourceDir?: string;
}

export type SentenceSplitterOptions = TokenizerOptions;

export type InfoSubsetField =
  | "surface"
  | "pos"
  | "posId"
  | "normalized"
  | "dictionaryForm"
  | "reading"
  | "synonymGroupIds";

export type InfoSubsetFields = readonly InfoSubsetField[];

export interface InfoSubset {
  fields?: InfoSubsetFields;
}

export interface SentenceSpan {
  text: string;
  start: number;
  end: number;
}

export interface SentenceDetector {
  getEos(text: string): number | null;
  withLimit(limit: number): SentenceDetector;
}

export interface Morpheme {
  surface: string;
  normalized: string;
  dictionaryForm: string;
  reading: string;
  pos: string;
  begin: number;
  end: number;
  beginChar: number;
  endChar: number;
  wordId: string;
  posId: number;
  dictionaryId: number;
  isOov: boolean;
  totalCost: number;
  synonymGroupIds: number[];
}

export interface MorphemeList extends Array<Morpheme> {
  internalCost: number;
}

export interface LookupEntry {
  surface: string;
  pos: string;
  wordId: string;
  posId?: number;
  dictionaryId: number;
  isOov: boolean;
}

export interface PretokenizedToken {
  surface: string;
  normalized: string;
  dictionaryForm: string;
  reading: string;
  pos: string;
  beginByte: number;
  endByte: number;
  beginChar: number;
  endChar: number;
  wordId: string;
  posId: number;
  dictionaryId: number;
  isOov: boolean;
  synonymGroupIds: number[];
}

export type PretokenizedResult = PretokenizedToken[];

export interface PretokenizeOptions {
  mode?: TokenizeMode;
  projection?: SurfaceProjection;
  subset?: InfoSubset;
}

export interface PretokenizerOptions
  extends NativeLibraryLoadOptions,
    PretokenizeOptions {
  dictPath: string;
  configPath?: string;
  resourceDir?: string;
}

export type PosMatcherPatternItem = string | null | undefined;
export type PosMatcherPattern = readonly PosMatcherPatternItem[];
export type PosMatcherPatterns = readonly PosMatcherPattern[];

export interface TokenizeArgs {
  text: string;
  projection: SurfaceProjection;
  mode?: TokenizeMode;
  subset?: InfoSubset;
}

export interface StatefulTokenizerOptions {
  text?: string;
  mode?: TokenizeMode;
  subset?: InfoSubset;
}

export interface StatefulTokenizeArgs {
  projection: SurfaceProjection;
}

export interface LookupArgs {
  surface: string;
  projection: SurfaceProjection;
  subset?: InfoSubset;
}

export interface SplitArgs {
  morpheme: Morpheme;
  projection: SurfaceProjection;
  mode?: TokenizeMode;
}

export interface SplitIntoArgs {
  morphemes: readonly Morpheme[];
  projection: SurfaceProjection;
  mode?: TokenizeMode;
}

export interface CreatePosMatcherArgs {
  patterns: PosMatcherPatterns;
}

export type NativeSudachiErrorCode =
  | "OK"
  | "NULL_POINTER"
  | "INVALID_UTF8"
  | "INVALID_MODE"
  | "INVALID_INDEX"
  | "CONFIG"
  | "TOKENIZE"
  | "SPLIT"
  | "LOOKUP"
  | "PRETOKENIZE"
  | "PRETOKENIZER"
  | "MORPHEME_SPLIT"
  | "SENTENCE_SPLIT"
  | "INTERNAL"
  | "UNKNOWN";

export type SudachiErrorCode =
  | NativeSudachiErrorCode
  | "INVALID_ARGUMENT"
  | "LAYOUT_MISMATCH"
  | "MISSING_ARGUMENT"
  | "TOKENIZER_CLOSED"
  | "PRETOKENIZER_CLOSED"
  | "SENTENCE_SPLITTER_CLOSED";

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

export function isSurfaceProjection(value: string): value is SurfaceProjection {
  return SURFACE_PROJECTIONS.includes(value as SurfaceProjection);
}

export function parseSurfaceProjection(value: string): SurfaceProjection {
  if (isSurfaceProjection(value)) {
    return value;
  }

  throw new SudachiError(`Invalid projection: ${value}`, {
    code: "INVALID_ARGUMENT",
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
