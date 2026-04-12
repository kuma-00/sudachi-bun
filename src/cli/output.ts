import type { Morpheme, SurfaceProjection } from "../types.ts";

export type TokenizeOutputFormat = "normal" | "wakati" | "all";

export function formatTokenizeOutput(
  morphemes: Morpheme[],
  format: TokenizeOutputFormat,
  _projection: SurfaceProjection,
): string {
  switch (format) {
    case "wakati":
      return morphemes.map((morpheme) => morpheme.surface).join(" ");
    case "all":
    case "normal":
      return JSON.stringify(morphemes, null, 2);
  }
}
