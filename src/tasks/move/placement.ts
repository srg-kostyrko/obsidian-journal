import { hiddenLines } from "./hidden-lines";

import type { BlockGroup } from "./plan";

const HEADING = /^(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;

interface HeadingAt {
  readonly index: number;
  readonly level: number;
  readonly text: string;
}

const isBlank = (line: string): boolean => line.trim() === "";

// A heading inside a comment is hidden: inserting under it would hide the inserted tasks too.
function scanHeadings(lines: readonly string[]): HeadingAt[] {
  const hidden = hiddenLines(lines);
  const found: HeadingAt[] = [];
  for (const [i, raw] of lines.entries()) {
    if (hidden.has(i)) continue;
    const match = HEADING.exec(raw.replace(/\r$/, ""));
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
