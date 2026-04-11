export const COMMON_NATIVE_SYMBOL_DEFS = {
  sudachi_get_last_error: {
    args: [],
    returns: "cstring",
  },
  sudachi_status_code_name: {
    args: ["i32"],
    returns: "cstring",
  },
} as const;
