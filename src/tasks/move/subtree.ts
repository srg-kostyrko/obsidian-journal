const LIST_LINE = /^\s*(?:[-*+]|\d+[.)])(?:\s|$)/u;
const CHECKBOX_LINE = /^\s*(?:[-*+]|\d+[.)])\s+\[.\]/u;
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

const QUOTE_PREFIX = /^(?:>[ \t]?)*/u;

interface Measured {
  readonly depth: number;
  readonly body: string;
}

// A quoted list nests by the indent after its `>` markers, and only among lines at one quote depth.
function measure(line: string): Measured {
  const prefix = QUOTE_PREFIX.exec(line)?.[0] ?? "";
  return { depth: prefix.split(">").length - 1, body: line.slice(prefix.length) };
}

export function isListLine(line: string): boolean {
  return LIST_LINE.test(measure(line).body);
}

export function isCheckboxLine(line: string): boolean {
  return CHECKBOX_LINE.test(measure(line).body);
}

function isBlank(line: string): boolean {
  return line.trim() === "";
}

// Measured on the text, not on NoteStructure: listItems drops non-task bullets, and an item's
// endLine stops before its children.
/** The last line index of the subtree rooted at `root`. */
export function subtreeEnd(lines: readonly string[], root: number): number {
  const base = measure(lines.at(root) ?? "");
  const baseIndent = indentOf(base.body);
  let end = root;
  for (let index = root + 1; index < lines.length; index++) {
    const line = lines[index] ?? "";
    // An unquoted blank line ends a quote.
    if (isBlank(line)) {
      if (base.depth > 0) break;
      continue;
    }
    const { depth, body } = measure(line);
    if (depth !== base.depth) break;
    if (isBlank(body)) continue;
    if (indentOf(body) <= baseIndent) break;
    end = index;
  }
  return end;
}

/** List-line indices enclosing `root`, nearest last. */
export function ancestorsOf(lines: readonly string[], root: number): readonly number[] {
  const chain: number[] = [];
  const base = measure(lines.at(root) ?? "");
  let threshold = indentOf(base.body);
  for (let index = root - 1; index >= 0 && threshold > 0; index--) {
    const line = lines[index] ?? "";
    if (isBlank(line)) {
      if (base.depth > 0) break;
      continue;
    }
    const { depth, body } = measure(line);
    if (depth !== base.depth) break;
    if (isBlank(body)) continue;
    const indent = indentOf(body);
    if (!LIST_LINE.test(body)) {
      if (indent === 0) break;
      continue;
    }
    if (indent >= threshold) continue;
    chain.push(index);
    threshold = indent;
  }
  return chain.toReversed();
}
