import type { BlockGroup } from "./plan";

const HEADING = /^(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;

interface HeadingAt {
  readonly index: number;
  readonly level: number;
  readonly text: string;
}

const isBlank = (line: string): boolean => line.trim() === "";

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

// The comment still open at the end of `line`, given the one open at its start. A marker inside
// inline code is literal text.
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
    at = found.index + token.length;
    if (token === "<!--" || token === "%%") {
      comment = token;
      continue;
    }
    const end = codeSpanEnd(line, at, token.length);
    if (end !== -1) at = end;
  }
}

// A heading inside a comment is hidden: inserting under it would hide the inserted tasks too.
function scanHeadings(lines: readonly string[]): HeadingAt[] {
  const found: HeadingAt[] = [];
  let fence: { char: string; length: number } | null = null;
  let comment: CommentOpen | null = null;
  for (let i = frontmatterEnd(lines) + 1; i < lines.length; i++) {
    const line = (lines[i] ?? "").replace(/\r$/, "");
    const trimmed = line.trimStart();
    const marker = /^(`{3,}|~{3,})/.exec(trimmed)?.[1];
    if (fence) {
      const closes = marker?.startsWith(fence.char.repeat(fence.length)) && trimmed.slice(marker.length).trim() === "";
      if (closes) fence = null;
      continue;
    }
    if (comment === null && marker) {
      fence = { char: marker.charAt(0), length: marker.length };
      continue;
    }
    const inComment = comment !== null;
    comment = commentAfter(line, comment);
    if (inComment) continue;
    const match = HEADING.exec(line);
    if (match) found.push({ index: i, level: (match[1] ?? "").length, text: match[2] ?? "" });
  }
  return found;
}

function lastNonBlank(lines: readonly string[], from: number, to: number): number {
  for (let i = to - 1; i >= from; i--) {
    if (!isBlank(lines[i] ?? "")) return i;
  }
  return from - 1;
}

function insertionIndex(lines: readonly string[], group: BlockGroup, targetHeading: string): number {
  const headings = scanHeadings(lines);
  const wanted = [group.heading, targetHeading].filter((h): h is string => h !== null && h !== "");
  for (const text of wanted) {
    const at = headings.findIndex((h) => h.text === text);
    const heading = headings[at];
    if (!heading) continue;
    // Any next heading ends the section's own lines: a child heading opens a subsection whose items
    // are not this section's, and an equal or higher one ends the section.
    const end = headings.at(at + 1)?.index ?? lines.length;
    return lastNonBlank(lines, heading.index + 1, end) + 1;
  }
  return lastNonBlank(lines, 0, lines.length) + 1;
}

interface Segment {
  text: string;
  term: string;
}

function segmentsOf(target: string): Segment[] {
  const pieces = target.split("\n");
  const last = pieces.pop() ?? "";
  const segments = pieces.map((piece): Segment =>
    piece.endsWith("\r") ? { text: piece.slice(0, -1), term: "\r\n" } : { text: piece, term: "\n" },
  );
  if (last !== "") segments.push({ text: last, term: "" });
  return segments;
}

/** Inserts each group's lines under its matching heading, else the configured heading, else the end; a section's lines end at its first subheading. */
export function placeGroups(target: string, groups: readonly BlockGroup[], targetHeading: string): string {
  const eol = target.includes("\r\n") ? "\r\n" : "\n";
  const segments = segmentsOf(target);
  for (const group of groups) {
    if (group.lines.length === 0) continue;
    const at = insertionIndex(
      segments.map((seg) => seg.text.replace(/\r$/, "")),
      group,
      targetHeading,
    );
    const inserted = group.lines.map((line): Segment => ({ text: line.replace(/\r$/, ""), term: eol }));
    const previous = segments[at - 1];
    if (at === segments.length && previous?.term === "") {
      previous.term = previous.text.endsWith("\r") ? "\n" : eol;
      const final = inserted.at(-1);
      if (final) final.term = "";
    }
    segments.splice(at, 0, ...inserted);
  }
  return segments.map((seg) => seg.text + seg.term).join("");
}
