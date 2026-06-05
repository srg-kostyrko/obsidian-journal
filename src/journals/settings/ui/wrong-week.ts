import { tokenize } from "@/templates";

function stripLiterals(format: string): string {
  return format.replaceAll(/\[.*?\]/g, "");
}

export function formatHasWrongWeek(format: string): boolean {
  return stripLiterals(format).includes("W");
}

export function templateHasWrongWeek(template: string): boolean {
  return tokenize(template).some(
    (token) => "format" in token && token.format !== undefined && formatHasWrongWeek(token.format),
  );
}
