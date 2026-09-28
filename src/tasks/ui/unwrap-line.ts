// A task's markdown is hydrated from the note's raw lines, so it arrives still wrapped in whatever
// block context it was written inside — a list's indentation, a callout's `>` markers, or both.
// The listing re-hosts that line on its own, where none of it describes the task any more: a
// tab-indented line renders as a code block, with no checkbox to click and no `data-task` for a
// theme to key off, and a quoted one renders as a blockquote, drawing the callout's border around
// a single row. Nesting is already carried structurally by the row's `depth`.
//
// Stripping the first line's exact prefix rather than a measured width keeps a continuation's
// indentation relative to the line it belongs to, and never has to decide what a tab is worth. The
// prefix is anchored, so an angle bracket inside the task's own text is left alone.
export function unwrapLine(markdown: string): string {
  const lines = markdown.split("\n");
  const prefix = /^[\t >]*/.exec(lines.at(0) ?? "")?.[0] ?? "";
  if (prefix === "") return markdown;
  return lines.map((line) => (line.startsWith(prefix) ? line.slice(prefix.length) : line)).join("\n");
}
