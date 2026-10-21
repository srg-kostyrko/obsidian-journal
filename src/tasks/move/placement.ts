import type { BlockGroup } from "./plan";

const HEADING = /^(#{1,6})[ \t]+(.*?)[ \t]*(?:#+[ \t]*)?$/;

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

function scanHeadings(lines: readonly string[]): HeadingAt[] {
  const found: HeadingAt[] = [];
  let fence: { char: string; length: number } | null = null;
  for (let i = frontmatterEnd(lines) + 1; i < lines.length; i++) {
    const line = (lines[i] ?? "").replace(/\r$/, "");
    const trimmed = line.trimStart();
    const marker = /^(`{3,}|~{3,})/.exec(trimmed)?.[1];
    if (fence) {
      const closes = marker?.startsWith(fence.char.repeat(fence.length)) && trimmed.slice(marker.length).trim() === "";
      if (closes) fence = null;
      continue;
    }
    if (marker) {
      fence = { char: marker.charAt(0), length: marker.length };
      continue;
    }
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
    const end = headings.slice(at + 1).find((h) => h.level <= heading.level)?.index ?? lines.length;
    return lastNonBlank(lines, heading.index + 1, end) + 1 || heading.index + 1;
  }
  return lastNonBlank(lines, 0, lines.length) + 1;
}

/** Inserts each group's lines under its matching heading in the target text, else the configured heading, else the end. */
export function placeGroups(target: string, groups: readonly BlockGroup[], targetHeading: string): string {
  const eol = target.includes("\r\n") ? "\r\n" : "\n";
  const trailing = target === "" || target.endsWith("\n");
  const lines = target === "" ? [] : target.split("\n").map((l) => l.replace(/\r$/, ""));
  if (target !== "" && trailing) lines.pop();
  for (const group of groups) {
    if (group.lines.length === 0) continue;
    const inserted = group.lines.map((l) => l.replace(/\r$/, ""));
    lines.splice(insertionIndex(lines, group, targetHeading), 0, ...inserted);
  }
  return lines.join(eol) + (trailing ? eol : "");
}
