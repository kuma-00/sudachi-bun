import { COMMON_NATIVE_SYMBOL_DEFS } from "./common.ts";

export const PRETOKENIZER_NATIVE_SYMBOL_DEFS = {
  ...COMMON_NATIVE_SYMBOL_DEFS,
  sudachi_create_pretokenizer: {
    args: ["cstring", "cstring", "cstring", "ptr"],
    returns: "i32",
  },
  sudachi_set_pretokenizer_debug: {
    args: ["ptr", "i32"],
    returns: "i32",
  },
  sudachi_free_pretokenizer: {
    args: ["ptr"],
    returns: "void",
  },
  sudachi_pretokenize: {
    args: ["ptr", "cstring", "i32", "i32", "ptr"],
    returns: "i32",
  },
  sudachi_pretokenize_subset: {
    args: ["ptr", "cstring", "i32", "i32", "u32", "ptr"],
    returns: "i32",
  },
  sudachi_free_pretokenized_result: {
    args: ["ptr"],
    returns: "void",
  },
  sudachi_get_pretokenized_result_layout: {
    args: ["ptr"],
    returns: "i32",
  },
} as const;
