import { tokenize } from "@/templates";

// date / start_date / end_date vary per anchor; numbering variables vary per entry. A
// template carrying any of them yields a distinct path per entry.
const DATE_VARIABLES: ReadonlySet<string> = new Set(["date", "start_date", "end_date"]);

// True when the name template has no per-entry variable, so every entry resolves to the
// same note path and all entries collapse onto one note (issue #175). An empty template is
// a separate concern and does not warn here.
export function nameTemplateCollides(template: string, numberingVariables: readonly string[]): boolean {
  if (!template) return false;
  const varying = new Set<string>([...DATE_VARIABLES, ...numberingVariables]);
  return tokenize(template).every((token) => token.kind !== "variable" || !varying.has(token.name));
}
