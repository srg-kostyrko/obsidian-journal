// VitePress compiles every manual page as a Vue template, so a literal `{{...}}`
// in prose — even inside inline backticks — is evaluated as a Vue expression
// rather than shown as text. A plain variable name renders blank with the build
// still green, so nothing else in the pipeline catches a forgotten `::: v-pre`
// wrap; this walks the source tree directly and looks for one.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { markdownFiles, scanMarkdown } from "./docs-markdown.mjs";

const {
  values: { src },
} = parseArgs({
  options: {
    src: { type: "string", default: "docs/user" },
  },
});

// VitePress never compiles frontmatter, so `{{` there is inert.
function frontmatterEndLine(lines) {
  if (lines[0]?.line !== "---") return 0;
  const close = lines.slice(1).find((entry) => entry.line === "---");
  return close ? close.lineno : 0;
}

function findMustaches(text) {
  const { lines } = scanMarkdown(text);
  const skipThrough = frontmatterEndLine(lines);
  return lines.filter(
    ({ lineno, line, fenced, inVPre }) => lineno > skipThrough && !fenced && !inVPre && line.includes("{{"),
  );
}

let total = 0;
for (const mdPath of markdownFiles(src)) {
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
