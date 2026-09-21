// The one reader of CHANGELOG.md's release sections: `release-notes.mjs` extracts a section to
// publish as a release's notes, and `check-changelog.mjs` gates the shape those notes are cut from.
// Both were hand-rolled awk in the release runbook before, which is how 3.5.0's notes went out
// needing a stray blank line stripped by hand.
import { scanMarkdown } from "./docs-markdown.mjs";

const RELEASE_HEADING = /^## \[([^\]]+)\]/;
const SUB_HEADING = /^#{1,3} /;
const BULLET = /^[-*+] /;
const HTML_COMMENT = /^<!--.*-->$/;

/**
 * Every `## [version]` section, in file order.
 *
 * @param {string} text
 * @returns {{ version: string, lineno: number, body: string[] }[]}
 */
export function releaseSections(text) {
  const lines = text.split("\n");
  const sections = [];
  for (const [index, line] of lines.entries()) {
    const heading = RELEASE_HEADING.exec(line);
    if (heading === null) continue;
    if (sections.length > 0) sections.at(-1).end = index;
    sections.push({ version: heading[1], lineno: index + 1, start: index + 1, end: lines.length });
  }
  return sections.map(({ version, lineno, start, end }) => ({ version, lineno, body: lines.slice(start, end) }));
}

/**
 * A release's section body, ready to publish as its notes: the heading stripped, since the release
 * is already titled with its version, and no blank line or generator comment at either end.
 *
 * @param {string} text
 * @param {string} version
 * @returns {string | null}
 */
export function releaseNotes(text, version) {
  const section = releaseSections(text).find((candidate) => candidate.version === version);
  if (section === undefined) return null;
  const body = [...section.body];
  while (body.length > 0 && (body[0].trim() === "" || HTML_COMMENT.test(body[0].trim()))) body.shift();
  while (body.length > 0 && (body.at(-1).trim() === "" || HTML_COMMENT.test(body.at(-1).trim()))) body.pop();
  return body.join("\n");
}

/**
 * Blank lines that separate one bullet from the next inside a release section. Markdown renders
 * such a list loose — every bullet wrapped in its own paragraph — so one stray line changes how the
 * whole section reads, on GitHub and in the published release notes alike.
 *
 * @param {string} text
 * @returns {{ lineno: number, version: string }[]}
 */
export function looseListLines(text) {
  const { lines } = scanMarkdown(text);
  const findings = [];
  let version = null;
  let inList = false;
  for (const [index, { line, fenced }] of lines.entries()) {
    if (fenced) continue;
    const heading = RELEASE_HEADING.exec(line);
    if (heading !== null) {
      version = heading[1];
      inList = false;
      continue;
    }
    if (SUB_HEADING.test(line)) {
      inList = false;
      continue;
    }
    if (BULLET.test(line)) {
      inList = true;
      continue;
    }
    if (line.trim() === "") {
      if (!inList || version === null) continue;
      const next = lines.slice(index + 1).find(({ line: candidate }) => candidate.trim() !== "");
      if (next !== undefined && BULLET.test(next.line)) findings.push({ lineno: index + 1, version });
      continue;
    }
    // A continuation line — an indented wrap or a nested block — keeps the item open; anything at
    // column zero that is neither a heading nor a bullet ends the list.
    if (!line.startsWith(" ") && !line.startsWith("\t")) inList = false;
  }
  return findings;
}
