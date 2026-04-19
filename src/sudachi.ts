import { createDictionary, type Dictionary } from "./dictionary.ts";
import type { DictionaryOptions } from "./types.ts";

export type CreateSudachiOptions = DictionaryOptions;
export type Sudachi = Dictionary;

export function createSudachi(options: CreateSudachiOptions): Sudachi {
  return createDictionary(options);
}
