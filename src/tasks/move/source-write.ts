import { subtreeEnd, TRAILING_BLOCK_ID } from "./subtree";

import type { PlannedRoot } from "./plan";

const TRAILING_SPACE = /\s*$/u;

// A block id must stay last on its line or it stops resolving, so the stamp goes in front of it.
/** Inserts ` ${marker}` into a line, ahead of any trailing block id or whitespace. */
export function stampLine(line: string, marker: string): string {
  const at = TRAILING_BLOCK_ID.exec(line)?.index ?? TRAILING_SPACE.exec(line)?.index;
  return `${line.slice(0, at)} ${marker}${line.slice(at)}`;
}

export type SourceRewrite = { readonly kind: "stamp"; readonly marker: string } | { readonly kind: "remove" };

export type SourceRewriteOutcome = { readonly content: string } | { readonly reason: "changed" };

// A root whose text or subtree extent no longer matches the plan refuses the whole note:
// stamping or deleting by line number would otherwise land on whatever drifted into place, and a
// stale extent after a deleted child would remove the sibling below it.
function stillPlanned(lines: readonly string[], root: PlannedRoot): boolean {
  if (!Number.isSafeInteger(root.line) || root.line < 0 || root.line >= lines.length) return false;
  if (subtreeEnd(lines, root.line) !== root.end || root.lines.length !== root.end - root.line + 1) return false;
  return root.lines.every((text, offset) => lines[root.line + offset] === text);
}

// Overlapping roots would splice or stamp the same lines twice; planSource never yields them, so
// meeting them means the caller is not holding a plan.
function disjoint(sorted: readonly PlannedRoot[]): boolean {
  return sorted.every((root, index) => index === 0 || root.line > (sorted[index - 1]?.end ?? -1));
}

/** Stamps or removes every planned root, or refuses if the note no longer matches the plan. */
export function rewriteSource(content: string, roots: readonly PlannedRoot[], op: SourceRewrite): SourceRewriteOutcome {
  const lines = content.split("\n");
  const topDown = roots.toSorted((a, b) => a.line - b.line);
  if (!disjoint(topDown) || topDown.some((root) => !stillPlanned(lines, root))) return { reason: "changed" };
  for (const root of topDown.toReversed()) {
    if (op.kind === "remove") lines.splice(root.line, root.end - root.line + 1);
    else lines[root.line] = stampLine(root.firstLine, op.marker);
  }
  return { content: lines.join("\n") };
}
