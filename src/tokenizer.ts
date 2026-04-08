export { createTokenizer, Tokenizer } from "./tokenizer/core.ts";
export { main } from "./tokenizer/cli.ts";
export { SudachiError } from "./tokenizer/types.ts";
export type { Morpheme, TokenizeMode, TokenizerOptions } from "./tokenizer/types.ts";

if (import.meta.main) {
  const { main } = await import("./tokenizer/cli.ts");
  main();
}
