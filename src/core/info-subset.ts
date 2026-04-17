import {
  type InfoSubset,
  type InfoSubsetField,
  SudachiError,
} from "../types.ts";

export const INFO_SUBSET_FFI_POS_TEXT_BIT = 1 << 30;

export const INFO_SUBSET_FIELD_BITS: Record<InfoSubsetField, number> = {
  surface: 1 << 0,
  headWordLength: 1 << 1,
  pos: (1 << 2) | INFO_SUBSET_FFI_POS_TEXT_BIT,
  posId: 1 << 2,
  normalized: 1 << 3,
  dictionaryForm: 1 << 4,
  reading: 1 << 5,
  splitA: 1 << 6,
  splitB: 1 << 7,
  wordStructure: 1 << 8,
  synonymGroupIds: 1 << 9,
};

export const ALL_INFO_SUBSET_BITS =
  INFO_SUBSET_FIELD_BITS.surface |
  INFO_SUBSET_FIELD_BITS.headWordLength |
  INFO_SUBSET_FIELD_BITS.pos |
  INFO_SUBSET_FIELD_BITS.posId |
  INFO_SUBSET_FIELD_BITS.normalized |
  INFO_SUBSET_FIELD_BITS.dictionaryForm |
  INFO_SUBSET_FIELD_BITS.reading |
  INFO_SUBSET_FIELD_BITS.splitA |
  INFO_SUBSET_FIELD_BITS.splitB |
  INFO_SUBSET_FIELD_BITS.wordStructure |
  INFO_SUBSET_FIELD_BITS.synonymGroupIds;

export function resolveInfoSubsetBits(
  options: InfoSubset | undefined,
): number | null {
  if (options === undefined) {
    return null;
  }

  const fields = options.fields;
  if (fields === undefined) {
    return ALL_INFO_SUBSET_BITS;
  }

  let bits = 0;
  for (const field of fields) {
    const bit = INFO_SUBSET_FIELD_BITS[field];
    if (bit === undefined) {
      throw new SudachiError(`Unsupported info subset field: ${field}.`, {
        code: "INVALID_ARGUMENT",
      });
    }

    bits |= bit;
  }

  return bits;
}
