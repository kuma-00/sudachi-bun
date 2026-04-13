import { COMMON_NATIVE_SYMBOL_DEFS } from "./common.ts";

export const SENTENCE_SPLITTER_NATIVE_SYMBOL_DEFS = {
  ...COMMON_NATIVE_SYMBOL_DEFS,
  sudachi_create_sentence_splitter: {
    args: ["cstring", "cstring", "cstring", "ptr"],
    returns: "i32",
  },
  sudachi_free_sentence_splitter: {
    args: ["ptr"],
    returns: "void",
  },
  sudachi_split_sentences: {
    args: ["ptr", "cstring", "ptr"],
    returns: "i32",
  },
  sudachi_get_eos: {
    args: ["ptr", "cstring", "ptr", "ptr"],
    returns: "i32",
  },
  sudachi_get_eos_with_limit: {
    args: ["ptr", "cstring", "i32", "ptr", "ptr"],
    returns: "i32",
  },
  sudachi_free_sentence_spans: {
    args: ["ptr"],
    returns: "void",
  },
  sudachi_get_sentence_span_layout: {
    args: ["ptr"],
    returns: "i32",
  },
} as const;
