export * from "./src/tokenizer.ts";

if (import.meta.main) {
  const { main } = await import("./src/tokenizer.ts");
  main();
}
