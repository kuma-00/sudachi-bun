import type { CliHelpTarget } from "./types.ts";

function tokenizeHelp(): string {
  return [
    "Usage:",
    "  bun run index.ts tokenize --dict-path=/path/to/dictionary --library-path=/path/to/libsudachi_ffi.dylib [--text='...' | input.txt [more.txt ...] | pipe] [--wakati|--all] [--split-sentences] [--debug] [--resource-dir <path>] [--output <path>|-]",
    "",
    "Options:",
    "  --wakati           Output space-joined surfaces.",
    "  --all              Use the explicit all output mode.",
    "  --split-sentences  Tokenize input sentence by sentence.",
    "  --debug            Emit debug diagnostics to stderr.",
    "  --resource-dir <path>",
    "                     Use a custom resource directory.",
    "  --output <path>|-  Write to a file, or stdout with -.",
    "",
    "Environment variables:",
    "  SUDACHI_DICT_PATH",
    "  SUDACHI_DICTIONARY_PATH",
    "  SUDACHI_CONFIG_PATH",
    "  SUDACHI_FFI_PATH",
    "  SUDACHI_FFI_DIR",
  ].join("\n");
}

function notImplementedHelp(command: Exclude<CliHelpTarget, "top-level" | "tokenize">): string {
  return [
    "Usage:",
    `  bun run index.ts ${command} [--help]`,
    "",
    "Status:",
    "  Not implemented yet. TODO delegate to dictionary layer.",
  ].join("\n");
}

function topLevelHelp(): string {
  return [
    "Usage:",
    "  bun run index.ts <command> [options]",
    "",
    "Commands:",
    "  tokenize  Tokenize text.",
    "  build     Build a dictionary.",
    "  ubuild    Build an Uber dictionary.",
    "  dump      Dump dictionary contents.",
    "",
    "Use `bun run index.ts <command> --help` for command-specific help.",
    "",
    "Environment variables:",
    "  SUDACHI_DICT_PATH",
    "  SUDACHI_DICTIONARY_PATH",
    "  SUDACHI_CONFIG_PATH",
    "  SUDACHI_FFI_PATH",
    "  SUDACHI_FFI_DIR",
  ].join("\n");
}

export function renderCliHelp(target: CliHelpTarget = "top-level"): string {
  switch (target) {
    case "top-level":
      return topLevelHelp();
    case "tokenize":
      return tokenizeHelp();
    case "build":
    case "ubuild":
    case "dump":
      return notImplementedHelp(target);
  }
}

