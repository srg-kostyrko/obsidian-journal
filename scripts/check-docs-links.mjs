// VitePress's build fails a link to a manual page that doesn't exist, but says
// nothing about a `#fragment` pointing at a heading that isn't there — three such
// dead links passed a green `docs:build` during the manual's port. This is the
// permanent version of the anchor check written for that port (a throwaway Python
// script, since discarded); it collects every heading/section `id` the built site
// produced and checks every markdown link against it. Ids are read from the whole
// HTML page, so a fragment that happens to match some unrelated theme element's id
// would still pass — that gap is accepted.
//
// Ported bugs fixed along the way: fence detection now follows CommonMark (so a
// `~~~` fence, or one indented inside a list item, doesn't leak its contents into
// the scan or desync the fence state for the rest of the file); a link with a
// title (`](/x#y "Title")`) is matched instead of silently skipped; and
// reference-style links (`[text][ref]` + `[ref]: /target`) are resolved and
// checked when their definition is site-relative or a bare fragment. A definition
// or inline link that points at a page-relative target (`./x`, `x`) is not
// something this script can resolve without walking the renderer's own path
// rules, so it is reported as unchecked rather than silently ignored.
//
// Inline code spans are stripped before a line is scanned for links: this manual
// documents syntax by showing it, so `` `[x](/nope)` `` in prose is example text,
// not a real link, and must not be checked. Only single-line spans are handled —
// a code span opened on one line and closed on a later one is a known gap.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const {
  values: { src, dist },
} = parseArgs({
  options: {
    src: { type: "string", default: "docs/user" },
    dist: { type: "string", default: "docs/user/.vitepress/dist" },
  },
});

function walk(dir, extension) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, extension));
    else if (entry.name.endsWith(extension)) out.push(full);
  }
  return out;
}

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function stripTrailingSlash(route) {
  return route.replace(/\/+$/, "") || "/";
}

function distRoute(relativeHtmlPath) {
  const posix = toPosix(relativeHtmlPath);
  const parsed = path.posix.parse(posix);
  if (parsed.base === "index.html") return stripTrailingSlash(parsed.dir === "" ? "/" : `/${parsed.dir}/`);
  return stripTrailingSlash(`/${posix.slice(0, -".html".length)}`);
}

function srcRoute(relativeMdPath) {
  const posix = toPosix(relativeMdPath);
  const parsed = path.posix.parse(posix);
  if (parsed.base === "index.md") return stripTrailingSlash(parsed.dir === "" ? "/" : `/${parsed.dir}`);
  return stripTrailingSlash(`/${posix.slice(0, -".md".length)}`);
}

// CommonMark fences: an opening line is 0-3 spaces of indentation plus 3+ of the
// same fence character; a closing line is the same character, at least as many of
// them, and nothing else but trailing whitespace.
function* unfencedLines(text) {
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

// A code span opens at a run of N backticks and closes at the next run of
// exactly N backticks; a run with no same-length match later on the line is
// literal text, not an opener, and must not swallow the rest of the line.
// Column positions don't matter here — the span's content is blanked out in
// place so the line length (and therefore nothing downstream) never shifts.
function stripCodeSpans(line) {
  const runs = [...line.matchAll(/`+/g)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
  const spans = [];
  let i = 0;
  while (i < runs.length) {
    const open = runs[i];
    const openLength = open.end - open.start;
    let j = i + 1;
    while (j < runs.length && runs[j].end - runs[j].start !== openLength) j++;
    if (j < runs.length) {
      spans.push([open.start, runs[j].end]);
      i = j + 1;
    } else {
      i++;
    }
  }
  if (spans.length === 0) return line;
  let out = "";
  let cursor = 0;
  for (const [start, end] of spans) {
    out += line.slice(cursor, start) + " ".repeat(end - start);
    cursor = end;
  }
  return out + line.slice(cursor);
}

function classify(target) {
  if (/^([a-z][\w+.-]*:)?\/\//i.test(target) || /^(mailto|tel):/i.test(target)) return "external";
  if (target.startsWith("/")) return "site";
  if (target.startsWith("#")) return "fragment";
  return "relative";
}

function resolveTarget(target, ownRoute) {
  if (target.startsWith("#")) return { route: ownRoute, frag: target.slice(1) };
  const hashIndex = target.indexOf("#");
  if (hashIndex === -1) return { route: stripTrailingSlash(target), frag: "" };
  return { route: stripTrailingSlash(target.slice(0, hashIndex)), frag: target.slice(hashIndex + 1) };
}

function exists(p) {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

if (!exists(dist)) {
  console.error(`check:docs-links: dist not found at "${dist}" — run \`npm run docs:build\` first`);
  process.exit(1);
}

const routes = new Map();
for (const htmlPath of walk(dist, ".html")) {
  const rel = path.relative(dist, htmlPath);
  const ids = new Set([...readFileSync(htmlPath, "utf8").matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  routes.set(distRoute(rel), ids);
}

const linkPattern = /(!?)\[([^\]]*)\](?:\(([^)]*)\)|\[([^\]]*)\])/g;
const definitionPattern = /^\[([^\]]+)\]:\s*(\S+)/;

const failures = [];
const unchecked = [];

for (const mdPath of walk(src, ".md")) {
  const ownRoute = srcRoute(path.relative(src, mdPath));
  const text = readFileSync(mdPath, "utf8");

  const definitions = new Map();
  for (const { line } of unfencedLines(text)) {
    const m = definitionPattern.exec(line);
    if (m) definitions.set(m[1].trim().toLowerCase(), m[2]);
  }

  for (const { lineno, line } of unfencedLines(text)) {
    const scanLine = stripCodeSpans(line);
    for (const m of scanLine.matchAll(linkPattern)) {
      const isImage = m[1] === "!";
      if (isImage) continue;

      let rawTarget;
      if (m[3] !== undefined) {
        rawTarget = m[3];
      } else {
        const label = (m[4] || m[2]).trim().toLowerCase();
        if (!definitions.has(label)) continue;
        rawTarget = definitions.get(label);
      }

      // Strips a trailing `"Title"` (or `'Title'`) — the target is always the
      // first whitespace-delimited token inside the parens or definition.
      const target = rawTarget.trim().split(/\s+/)[0];
      if (!target) continue;

      const kind = classify(target);
      if (kind === "external") continue;
      if (kind === "relative") {
        unchecked.push({ mdPath, lineno, target });
        continue;
      }

      const { route, frag } = resolveTarget(target, ownRoute);
      const ids = routes.get(route);
      if (!ids || (frag && !ids.has(frag))) failures.push({ mdPath, lineno, target });
    }
  }
}

for (const { mdPath, lineno, target } of unchecked) console.log(`UNCHECKED: ${mdPath}:${lineno} -> ${target}`);
for (const { mdPath, lineno, target } of failures) console.log(`DEAD: ${mdPath}:${lineno} -> ${target}`);

console.log(`${unchecked.length} unchecked link(s)`);
console.log(`${failures.length} dead link(s)`);
process.exit(failures.length > 0 ? 1 : 0);
