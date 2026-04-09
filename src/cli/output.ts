import type { Morpheme } from "../types.ts";

export type TokenizeOutputFormat = "normal" | "wakati" | "all";

export function formatTokenizeOutput(morphemes: Morpheme[], format: TokenizeOutputFormat): string {
  switch (format) {
    case "wakati":
      return morphemes.map((morpheme) => morpheme.surface).join(" ");
    case "all":
    case "normal":
      return JSON.stringify(morphemes, null, 2);
  }
}
