import { COMMON_NATIVE_SYMBOL_DEFS } from "./common.ts";

export const LOOKUP_NATIVE_SYMBOL_DEFS = {
  ...COMMON_NATIVE_SYMBOL_DEFS,
  sudachi_lookup: {
    args: ["ptr", "cstring", "i32", "ptr"],
    returns: "i32",
  },
  sudachi_lookup_subset: {
    args: ["ptr", "cstring", "i32", "u32", "ptr"],
    returns: "i32",
  },
  sudachi_free_lookup_result: {
    args: ["ptr"],
    returns: "void",
  },
  sudachi_get_lookup_result_layout: {
    args: ["ptr"],
    returns: "i32",
  },
} as const;
