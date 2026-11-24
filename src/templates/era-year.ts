import { mapFormatRuns, momentTokens } from "./format-regex";
import { tokenize } from "./grammar";

import type { Token } from "./types";

// moment's `y` is the era year, not the calendar year: the two render alike everywhere but `ja`,
// and the reverse parser cannot read an era year back. People type it from the Unicode convention,
// where `yyyy` is the calendar year.
const DATE_VARIABLES = new Set(["date", "start_date", "end_date"]);

export function hasEraYear(format: string): boolean {
  return momentTokens(format).some((token) => token.startsWith("y"));
}

export function replaceEraYear(format: string): string {
  return mapFormatRuns(format, (run, next) => {
    if (!run.startsWith("y")) return { text: run, consumed: 0 };
    // Only a lone y before o is moment's ordinal era year; after a longer run the o is the user's.
    if (run === "y" && next === "o") return { text: "YYYY", consumed: 1 };
    // The reverse parser reads YY and YYYY only, so every other length becomes YYYY.
    return { text: run === "yy" ? "YY" : "YYYY", consumed: 0 };
  });
}

function isDateToken(token: Token): token is Extract<Token, { kind: "variable" }> & { format: string } {
  return token.kind === "variable" && token.format !== undefined && DATE_VARIABLES.has(token.name.toLowerCase());
}

export function templateHasEraYear(template: string): boolean {
  return tokenize(template).some((token) => isDateToken(token) && hasEraYear(token.format));
}

export function replaceEraYearInTemplate(template: string): string {
  return tokenize(template)
    .map((token) => {
      if (token.kind === "literal") return token.text;
      if (!isDateToken(token)) return token.raw;
      // The parser trims the token's inner text, so the raw text may carry whitespace after the
      // format; cut the format off the trimmed inner text and keep the rest as written.
      const inner = token.raw.slice(0, -2);
      const formatEnd = inner.trimEnd().length;
      const head = inner.slice(0, formatEnd - token.format.length);
      const tail = token.raw.slice(formatEnd);
      return `${head}${replaceEraYear(token.format)}${tail}`;
    })
    .join("");
}
