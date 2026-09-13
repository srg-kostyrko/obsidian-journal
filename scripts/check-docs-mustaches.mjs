// VitePress compiles every manual page as a Vue template, so a literal `{{...}}`
// in prose — even inside inline backticks — is evaluated as a Vue expression
// rather than shown as text. A plain variable name renders blank with the build
// still green, so nothing else in the pipeline catches a forgotten `::: v-pre`
// wrap; this walks the source tree directly and looks for one.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { unfencedLines } from "./docs-markdown.mjs";

const {
  values: { src },
} = parseArgs({
  options: {
    src: { type: "string", default: "docs/user" },
  },
});

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "public") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

// VitePress never compiles frontmatter, so `{{` there is inert; line numbers must
// still be counted against the original file, hence returning a line number to
// skip through rather than slicing the text before it reaches unfencedLines.
function frontmatterEndLine(text) {
  const lines = text.split("\n");
  if (lines[0] !== "---") return 0;
  for (let index = 1; index < lines.length; index++) {
    if (lines[index] === "---") return index + 1;
  }
  return 0;
}

// markdown-it-container's own rule: an opener must carry a name (a bare `:::`
// closes nothing and must not be mistaken for one — the defect docs/user/.vitepress/llms.mts
// has under its optional-name opener regex); a closer needs no name and pops the
// top frame once its colon run is at least as long as the one it closes. Leading
// whitespace of any width is allowed on both, unlike the fence rule's 0-3 space
// cap: markdown-it-container honors a container nested inside a list item at the
// item's content indentation, which routinely exceeds 3 spaces. Known residual:
// this also matches a `:::` line sitting inside a 4-space-indented code block.
const CONTAINER_OPEN = /^[ \t]*(:{3,})(\s*\S.*)$/;
const CONTAINER_CLOSE = /^[ \t]*(:{3,})\s*$/;

function findMustaches(text) {
  const hits = [];
  const stack = [];
  const skipThrough = frontmatterEndLine(text);

  for (const { lineno, line } of unfencedLines(text)) {
    if (lineno <= skipThrough) continue;

    const closeMatch = CONTAINER_CLOSE.exec(line);
    const top = stack.at(-1);
    if (closeMatch && top && closeMatch[1].length >= top.colons) {
      stack.pop();
      continue;
    }

    const openMatch = CONTAINER_OPEN.exec(line);
    if (openMatch) {
      const name = openMatch[2].trim();
      stack.push({ colons: openMatch[1].length, isVPre: name === "v-pre" });
      continue;
    }

    const protectedByVPre = stack.some((frame) => frame.isVPre);
    if (!protectedByVPre && line.includes("{{")) hits.push({ lineno, line });
  }

  return hits;
}

let total = 0;
for (const mdPath of walk(src)) {
  const text = readFileSync(mdPath, "utf8");
  for (const { lineno, line } of findMustaches(text)) {
    const trimmed = line.trim();
    const truncated = trimmed.length > 120 ? trimmed.slice(0, 120) : trimmed;
    console.log(`MUSTACHE: ${mdPath}:${lineno} -> ${truncated}`);
    total++;
  }
}

console.log(`${total} unprotected mustache(s)`);
process.exit(total > 0 ? 1 : 0);
