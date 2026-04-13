import { COMMON_NATIVE_SYMBOL_DEFS } from "./common.ts";

export const TOKENIZER_NATIVE_SYMBOL_DEFS = {
  ...COMMON_NATIVE_SYMBOL_DEFS,
  sudachi_create_tokenizer: {
    args: ["cstring", "cstring", "cstring", "ptr"],
    returns: "i32",
  },
  sudachi_free_tokenizer: {
    args: ["ptr"],
    returns: "void",
  },
  sudachi_create_stateful_tokenizer_from_tokenizer: {
    args: ["ptr", "ptr"],
    returns: "i32",
  },
  sudachi_free_stateful_tokenizer: {
    args: ["ptr"],
    returns: "void",
  },
  sudachi_stateful_tokenizer_reset: {
    args: ["ptr", "cstring"],
    returns: "i32",
  },
  sudachi_stateful_tokenizer_set_mode: {
    args: ["ptr", "i32"],
    returns: "i32",
  },
  sudachi_stateful_tokenizer_set_subset: {
    args: ["ptr", "u32"],
    returns: "i32",
  },
  sudachi_stateful_tokenizer_do_tokenize: {
    args: ["ptr", "i32", "ptr"],
    returns: "i32",
  },
  sudachi_tokenize: {
    args: ["ptr", "cstring", "i32", "i32", "ptr"],
    returns: "i32",
  },
  sudachi_tokenize_subset: {
    args: ["ptr", "cstring", "i32", "i32", "u32", "ptr"],
    returns: "i32",
  },
  sudachi_split_morpheme: {
    args: ["ptr", "cstring", "i32", "i32", "usize", "i32", "ptr"],
    returns: "i32",
  },
  sudachi_split_morphemes: {
    args: ["ptr", "cstring", "i32", "i32", "i32", "ptr"],
    returns: "i32",
  },
  sudachi_compile_pos_matcher: {
    args: ["ptr", "cstring", "ptr"],
    returns: "i32",
  },
  sudachi_inspect_dictionary_bytes: {
    args: ["ptr", "usize", "ptr"],
    returns: "i32",
  },
  sudachi_free_result: {
    args: ["ptr"],
    returns: "void",
  },
  sudachi_free_pos_matcher_result: {
    args: ["ptr"],
    returns: "void",
  },
  sudachi_get_morpheme_result_layout: {
    args: ["ptr"],
    returns: "i32",
  },
  sudachi_get_dictionary_inspection_result_layout: {
    args: ["ptr"],
    returns: "i32",
  },
  sudachi_get_pos_matcher_result_layout: {
    args: ["ptr"],
    returns: "i32",
  },
} as const;
