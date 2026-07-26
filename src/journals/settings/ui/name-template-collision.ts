import type { AnchorString } from "@/calendar";
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

export interface PathCollision {
  readonly first: AnchorString;
  readonly second: AnchorString;
  readonly path: string;
}

export function findPathCollision(
  anchors: readonly AnchorString[],
  pathFor: (anchor: AnchorString) => string | undefined,
): PathCollision | null {
  const seen = new Map<string, AnchorString>();
  for (const current of anchors) {
    const path = pathFor(current);
    // An anchor that fails to render tells us nothing about collisions; treating the
    // absent paths as equal would report every such pair as a collision.
    if (path === undefined) continue;
    const first = seen.get(path);
    if (first !== undefined) return { first, second: current, path };
    seen.set(path, current);
  }
  return null;
}
