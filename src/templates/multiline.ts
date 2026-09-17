export type LineEnding = "\n" | "\r\n";

export function lineEndingOf(text: string): LineEnding {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

// Blank lines at either end carry nothing a reader sees, and a trailing one would open an empty
// list item.
export function normalizeMultiline(value: string): string {
  return value
    .replaceAll(/\r\n?/g, "\n")
    .replace(/^(?:[ \t]*\n)+/, "")
    .replace(/(?:\n[ \t]*)+$/, "");
}

const MARKDOWN_PREFIX_RE = /^([ \t]*(?:>[ \t]?)*[ \t]*)(?:([-*+]|(\d{1,9})([.)]))([ \t]+)(\[.\][ \t]+)?)?/;
const INDENT_RE = /^[ \t]*/;

interface Structure {
  readonly lead: string;
  readonly markerWidth: number;
  readonly markerAfter: (items: number) => string;
}

function structureOf(line: string, markdown: boolean): Structure {
  if (!markdown) return { lead: INDENT_RE.exec(line)?.[0] ?? "", markerWidth: 0, markerAfter: () => "" };
  const match = MARKDOWN_PREFIX_RE.exec(line);
  const lead = match?.[1] ?? "";
  const bullet = match?.[2];
  if (bullet === undefined) return { lead, markerWidth: 0, markerAfter: () => "" };
  const digits = match?.[3];
  const delimiter = match?.[4] ?? "";
  const gap = match?.[5] ?? "";
  const task = match?.[6] ?? "";
  return {
    lead,
    markerWidth: bullet.length + gap.length + task.length,
    markerAfter: (items) => `${digits === undefined ? bullet : `${Number(digits) + items}${delimiter}`}${gap}${task}`,
  };
}

/**
 * The rest of a multi-line value, continued under the markdown structure of the line it starts
 * on: quote markers and indentation repeat, a list item's own lines align under its text, and a
 * blank line starts the next item.
 */
export function continueMultiline(value: string, lineSoFar: string, eol: LineEnding, markdown = true): string {
  const { lead, markerWidth, markerAfter } = structureOf(lineSoFar, markdown);
  const continuation = lead + " ".repeat(markerWidth);
  let out = "";
  for (const [index, paragraph] of normalizeMultiline(value)
    .split(/\n(?:[ \t]*\n)+/)
    .entries()) {
    const [first = "", ...rest] = paragraph.split("\n");
    if (index === 0) out += first;
    else if (markerWidth > 0) out += `${eol}${lead}${markerAfter(index)}${first}`;
    else out += `${eol}${lead.trimEnd()}${eol}${continuation}${first}`;
    for (const line of rest) out += `${eol}${continuation}${line}`;
  }
  return out;
}
