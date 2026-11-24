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
    if (next === "o") return { text: "YYYY", consumed: 1 };
    if (run === "yy") return { text: "YY", consumed: 0 };
    if (run === "y") return { text: "Y", consumed: 0 };
    return { text: "YYYY", consumed: 0 };
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
      // A token's raw text ends in its format and the closing braces.
      const head = token.raw.slice(0, token.raw.length - token.format.length - 2);
      return `${head}${replaceEraYear(token.format)}}}`;
    })
    .join("");
}
