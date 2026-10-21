import { subtreeEnd, TRAILING_BLOCK_ID } from "./subtree";

import type { PlannedRoot } from "./plan";

const TRAILING_SPACE = /\s*$/u;

// A block id must stay last on its line or it stops resolving, so the stamp goes in front of it.
/** Inserts ` ${marker}` into a line, ahead of any trailing block id or whitespace. */
export function stampLine(line: string, marker: string): string {
  const at = TRAILING_BLOCK_ID.exec(line)?.index ?? TRAILING_SPACE.exec(line)?.index ?? line.length;
  return `${line.slice(0, at)} ${marker}${line.slice(at)}`;
}

export type SourceRewrite = { readonly kind: "stamp"; readonly marker: string } | { readonly kind: "remove" };

export type SourceRewriteOutcome = { readonly content: string } | { readonly reason: "changed" };

// A root whose first line or subtree extent no longer matches the plan refuses the whole note:
// stamping or deleting by line number would otherwise land on whatever drifted into place, and a
// stale extent after a deleted child would remove the sibling below it.
function stillPlanned(lines: readonly string[], root: PlannedRoot): boolean {
  if (!Number.isSafeInteger(root.line) || root.line < 0 || root.line >= lines.length) return false;
  return lines[root.line] === root.firstLine && subtreeEnd(lines, root.line) === root.end;
}

/** Stamps or removes every planned root, or refuses if the note no longer matches the plan. */
export function rewriteSource(content: string, roots: readonly PlannedRoot[], op: SourceRewrite): SourceRewriteOutcome {
  const lines = content.split("\n");
  if (roots.some((root) => !stillPlanned(lines, root))) return { reason: "changed" };
  const bottomUp = roots.toSorted((a, b) => b.line - a.line);
  for (const root of bottomUp) {
    if (op.kind === "remove") lines.splice(root.line, root.end - root.line + 1);
    else lines[root.line] = stampLine(root.firstLine, op.marker);
  }
  return { content: lines.join("\n") };
}
