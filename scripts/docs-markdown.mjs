// The one markdown grammar for docs/user: llms.mts, check-docs-links.mjs and
// check-docs-mustaches.mjs all read pages through it, so "inside a fence" and
// "inside a v-pre container" mean the same thing to each of them.
import { readdirSync } from "node:fs";
import path from "node:path";

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
// Container markers take any indentation, unlike fences: markdown-it-container
// honors one nested in a list item at the item's content column, which can
// exceed the fence rule's three spaces. The name is the first token, so
// `::: v-pre Some title` is still a v-pre container; it may not start with a
// colon, or `::::` would backtrack into an opener named `:`.
const CONTAINER_OPEN = /^[ \t]*(:{3,})[ \t]*([^\s:]\S*)/;
const CONTAINER_CLOSE = /^[ \t]*(:{3,})[ \t]*$/;

function closesFence(line, char, length) {
  const close = (char === "`" ? /^ {0,3}(`+)\s*$/ : /^ {0,3}(~+)\s*$/).exec(line);
  return close !== null && close[1].length >= length;
}

/** Every `.md` under `dir`, sorted, skipping dot-directories and `public/`. */
export function markdownFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "public") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownFiles(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out.sort();
}

/**
 * Classifies every line of a page as `{ lineno, line, fenced, inVPre, vPreMarker }`, a trailing
 * `\r` already stripped; `unclosedVPre` is set when a v-pre container never closes.
 */
export function scanMarkdown(text) {
  const lines = [];
  const stack = [];
  const inVPre = () => stack.some((frame) => frame.isVPre);
  let fenceChar = null;
  let fenceLength = 0;

  for (const [index, raw] of text.split("\n").entries()) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    const entry = { lineno: index + 1, line, fenced: false, inVPre: false, vPreMarker: false };
    lines.push(entry);

    if (fenceChar) {
      if (closesFence(line, fenceChar, fenceLength)) fenceChar = null;
      entry.fenced = true;
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    if (open) {
      fenceChar = open[1][0];
      fenceLength = open[1].length;
      entry.fenced = true;
      continue;
    }

    // markdown-it-container fixes a container's extent before parsing what is inside it, so a
    // closer ends the outermost open container it is long enough for, and every container
    // nested in that one closes with it. Measured on VitePress 1.6.4: `::: v-pre` holding a
    // `::: tip` ends at the tip's own `:::`, and the second `:::` is a paragraph.
    const closeMatch = CONTAINER_CLOSE.exec(line);
    const closes = closeMatch ? stack.findIndex((frame) => frame.colons <= closeMatch[1].length) : -1;
    if (closes !== -1) {
      entry.inVPre = inVPre();
      entry.vPreMarker = stack[closes].isVPre;
      stack.length = closes;
      continue;
    }
    const openMatch = CONTAINER_OPEN.exec(line);
    if (openMatch) {
      stack.push({ colons: openMatch[1].length, isVPre: openMatch[2] === "v-pre" });
      entry.vPreMarker = openMatch[2] === "v-pre";
    }
    entry.inVPre = inVPre();
  }

  return { lines, unclosedVPre: inVPre() };
}

/**
 * Every fenced block as `{ lineno, info, body }`, `lineno` being the opener's one-based line.
 * The manual shows a code block's source by wrapping it in a `markdown` fence, so a block
 * whose info word is `markdown` or `md` is followed by the blocks nested inside it.
 *
 * @param {string} text
 * @returns {{ lineno: number, info: string, body: string }[]}
 */
export function fenceBlocks(text) {
  const blocks = [];
  const emit = (fence) => {
    const body = fence.lines.join("\n");
    blocks.push({ lineno: fence.lineno, info: fence.info, body });
    if (fence.info === "markdown" || fence.info === "md") {
      for (const inner of fenceBlocks(body)) blocks.push({ ...inner, lineno: fence.lineno + inner.lineno });
    }
  };
  let open = null;
  for (const [index, raw] of text.split("\n").entries()) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (open) {
      if (!closesFence(line, open.char, open.length)) {
        open.lines.push(line);
        continue;
      }
      emit(open);
      open = null;
      continue;
    }
    const match = FENCE_OPEN.exec(line);
    if (match) {
      const info = line.slice(match[0].length).trim().split(/[\s{]/)[0] ?? "";
      open = { char: match[1][0], length: match[1].length, info, lineno: index + 1, lines: [] };
    }
  }
  // An unterminated fence runs to the end of the document, per CommonMark / markdown-it,
  // the same way scanMarkdown already reads it (every trailing line stays `fenced: true`).
  if (open) emit(open);
  return blocks;
}

/** Whether a line is the dark copy of a screenshot pair, which an agent reading the manual never needs twice. */
export function isDarkOnlyImage(line) {
  return /^\s*!\[[^\]]*\]\([^)]*\)\{\.dark-only\}\s*$/.test(line);
}
