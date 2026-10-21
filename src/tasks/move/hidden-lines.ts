function frontmatterEnd(lines: readonly string[]): number {
  if (lines[0]?.trim() !== "---") return -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") return i;
  }
  return -1;
}

const COMMENT_CLOSE = { "<!--": "-->", "%%": "%%" } as const;
type CommentOpen = keyof typeof COMMENT_CLOSE;

// A code span opened by a run of N backticks closes at the next run of exactly N; unclosed, the run is literal.
function codeSpanEnd(line: string, at: number, length: number): number {
  const runs = /`+/g;
  runs.lastIndex = at;
  for (let run = runs.exec(line); run; run = runs.exec(line)) {
    if (run[0].length === length) return run.index + length;
  }
  return -1;
}

function isEscaped(line: string, index: number, from: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= from && line.charAt(i) === "\\"; i--) backslashes++;
  return backslashes % 2 === 1;
}

// The comment still open at the end of `line`, given the one open at its start. A marker inside
// inline code is literal text. A backslash escapes only a marker's first character and the rest is
// scanned again, so a backslash before two backticks still opens a one-backtick span.
function commentAfter(line: string, open: CommentOpen | null): CommentOpen | null {
  let comment = open;
  let at = 0;
  for (;;) {
    if (comment !== null) {
      const close = line.indexOf(COMMENT_CLOSE[comment], at);
      if (close === -1) return comment;
      at = close + COMMENT_CLOSE[comment].length;
      comment = null;
      continue;
    }
    const next = /`+|<!--|%%/g;
    next.lastIndex = at;
    const found = next.exec(line);
    if (!found) return null;
    const token = found[0];
    if (isEscaped(line, found.index, at)) {
      at = found.index + 1;
      continue;
    }
    at = found.index + token.length;
    if (token === "<!--" || token === "%%") {
      comment = token;
      continue;
    }
    const end = codeSpanEnd(line, at, token.length);
    if (end !== -1) at = end;
  }
}

/** Indices of lines that are not markdown content: frontmatter, code fences with their markers, and lines that begin inside a comment. */
export function hiddenLines(lines: readonly string[]): ReadonlySet<number> {
  const hidden = new Set<number>();
  const front = frontmatterEnd(lines);
  for (let i = 0; i <= front; i++) hidden.add(i);
  let fence: { char: string; length: number } | null = null;
  let comment: CommentOpen | null = null;
  for (let i = front + 1; i < lines.length; i++) {
    const line = (lines[i] ?? "").replace(/\r$/, "");
    const trimmed = line.trimStart();
    const marker = /^(`{3,}|~{3,})/.exec(trimmed)?.[1];
    if (fence) {
      hidden.add(i);
      const closes = marker?.startsWith(fence.char.repeat(fence.length)) && trimmed.slice(marker.length).trim() === "";
      if (closes) fence = null;
      continue;
    }
    if (comment === null && marker) {
      hidden.add(i);
      fence = { char: marker.charAt(0), length: marker.length };
      continue;
    }
    if (comment !== null) hidden.add(i);
    comment = commentAfter(line, comment);
  }
  return hidden;
}
