import { subtreeEnd, TRAILING_BLOCK_ID } from "./subtree";

import type { PlannedRoot } from "./plan";
import type { EffectiveMove } from "./settings";

const TRAILING_SPACE = /\s*$/u;

// A block id must stay last on its line or it stops resolving, so the stamp goes in front of it.
/** Inserts ` ${marker}` into a line, ahead of any trailing block id or whitespace. */
export function stampLine(line: string, marker: string): string {
  const at = TRAILING_BLOCK_ID.exec(line)?.index ?? TRAILING_SPACE.exec(line)?.index;
  return `${line.slice(0, at)} ${marker}${line.slice(at)}`;
}

export type SourceRewrite = { readonly kind: "stamp"; readonly marker: string } | { readonly kind: "remove" };

/** What a move does to the line it leaves behind, or null when it leaves the source alone. */
export function sourceRewrite(move: Pick<EffectiveMove, "mode" | "stamp">, marker: string): SourceRewrite | null {
  if (move.mode === "move") return { kind: "remove" };
  // An empty marker would stamp a bare space and never read back as rolled.
  return move.stamp && marker !== "" ? { kind: "stamp", marker } : null;
}

export type SourceRewriteOutcome = { readonly content: string } | { readonly reason: "changed" };

// A root whose text or subtree extent no longer matches the plan refuses the whole note:
// stamping or deleting by line number would otherwise land on whatever drifted into place, and a
// stale extent after a deleted child would remove the sibling below it.
function stillPlanned(lines: readonly string[], root: PlannedRoot): boolean {
  if (!Number.isSafeInteger(root.line) || root.line < 0 || root.line >= lines.length) return false;
  if (subtreeEnd(lines, root.line) !== root.end || root.lines.length !== root.end - root.line + 1) return false;
  return root.lines.every((text, offset) => withoutCR(lines[root.line + offset] ?? "") === withoutCR(text));
}

// An editor buffer is always LF while a CRLF file read from disk keeps a \r on every line, so a root
// planned on one is compared to the other without it, and each line keeps the ending it had.
function withoutCR(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
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
  const endedBare = !(lines.at(-1) ?? "").endsWith("\r");
  for (const root of topDown.toReversed()) {
    if (op.kind === "remove") {
      lines.splice(root.line, root.end - root.line + 1);
      continue;
    }
    const stamped = stampLine(withoutCR(root.firstLine), op.marker);
    lines[root.line] = (lines[root.line] ?? "").endsWith("\r") ? `${stamped}\r` : stamped;
  }
  // Removing the last line leaves the line above it last, still carrying the \r its newline went with.
  const last = lines.at(-1);
  if (endedBare && last?.endsWith("\r") === true) lines[lines.length - 1] = withoutCR(last);
  return { content: lines.join("\n") };
}
