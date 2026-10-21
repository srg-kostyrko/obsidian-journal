const LIST_LINE = /^\s*(?:[-*+]|\d+[.)])(?:\s|$)/u;
export const TRAILING_BLOCK_ID = /\s\^[A-Za-z0-9-]+\s*$/u;

/** Leading whitespace width of a line, counting a tab as four columns. */
export function indentOf(line: string): number {
  let width = 0;
  for (const char of line) {
    if (char === " ") width += 1;
    else if (char === "\t") width += 4;
    else break;
  }
  return width;
}

function isBlank(line: string): boolean {
  return line.trim() === "";
}

// Measured on the text, not on NoteStructure: listItems drops non-task bullets, and an item's
// endLine stops before its children.
/** The last line index of the subtree rooted at `root`. */
export function subtreeEnd(lines: readonly string[], root: number): number {
  const base = indentOf(lines.at(root) ?? "");
  let end = root;
  for (let index = root + 1; index < lines.length; index++) {
    const line = lines[index] ?? "";
    if (isBlank(line)) continue;
    if (indentOf(line) <= base) break;
    end = index;
  }
  return end;
}

/** List-line indices enclosing `root`, nearest last. */
export function ancestorsOf(lines: readonly string[], root: number): readonly number[] {
  const chain: number[] = [];
  let threshold = indentOf(lines.at(root) ?? "");
  for (let index = root - 1; index >= 0 && threshold > 0; index--) {
    const line = lines[index] ?? "";
    if (isBlank(line)) continue;
    const indent = indentOf(line);
    if (!LIST_LINE.test(line)) {
      if (indent === 0) break;
      continue;
    }
    if (indent >= threshold) continue;
    chain.push(index);
    threshold = indent;
  }
  return chain.toReversed();
}
