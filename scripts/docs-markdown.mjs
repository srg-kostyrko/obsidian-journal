// CommonMark fence detection shared by the docs/user markdown checks
// (check-docs-links.mjs, check-docs-mustaches.mjs), so both agree on what
// counts as "inside a fenced code block" without drifting apart.

// CommonMark fences: an opening line is 0-3 spaces of indentation plus 3+ of the
// same fence character; a closing line is the same character, at least as many of
// them, and nothing else but trailing whitespace.
export function* unfencedLines(text) {
  let fenceChar = null;
  let fenceLength = 0;
  const lines = text.split("\n");
  for (const [index, line] of lines.entries()) {
    if (fenceChar) {
      const closeRe = fenceChar === "`" ? /^ {0,3}(`+)\s*$/ : /^ {0,3}(~+)\s*$/;
      const close = closeRe.exec(line);
      if (close && close[1].length >= fenceLength) fenceChar = null;
      continue;
    }
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (open) {
      fenceChar = open[1][0];
      fenceLength = open[1].length;
      continue;
    }
    yield { lineno: index + 1, line };
  }
}
