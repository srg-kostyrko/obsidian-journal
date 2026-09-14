// VitePress's build fails a link to a manual page that doesn't exist, but says
// nothing about a `#fragment` pointing at a heading that isn't there. This checks
// every markdown link against the `id`s the built site produced — read from the
// whole HTML page, so a fragment matching an unrelated theme element's id still
// passes; that gap is accepted. A page-relative target (`./x`, `x`) would need
// the renderer's own path rules to resolve, so it is reported as unchecked.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { markdownFiles, scanMarkdown } from "./docs-markdown.mjs";
import { linkedManualPaths, verifyManualLinks, verifyRedirects } from "./docs-manual-links.mjs";

const {
  values: { src, dist },
} = parseArgs({
  options: {
    src: { type: "string", default: "docs/user" },
    dist: { type: "string", default: "docs/user/.vitepress/dist" },
  },
});

function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(full));
    else if (entry.name.endsWith(".html")) out.push(full);
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

// This manual documents link syntax by showing it, so a link inside a code span is
// example text, not a link. A span opens at a run of N backticks and closes at the
// next run of exactly N; a run with no same-length match later on the line is
// literal text and must not swallow the rest of the line. Only single-line spans
// are handled. The span is blanked in place so nothing downstream shifts.
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
for (const htmlPath of htmlFiles(dist)) {
  const rel = path.relative(dist, htmlPath);
  const ids = new Set([...readFileSync(htmlPath, "utf8").matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  routes.set(distRoute(rel), ids);
}

const linkPattern = /(!?)\[([^\]]*)\](?:\(([^)]*)\)|\[([^\]]*)\])/g;
const definitionPattern = /^ {0,3}\[([^\]]+)\]:\s*(\S+)/;

const failures = [];
const unchecked = [];

for (const mdPath of markdownFiles(src)) {
  const ownRoute = srcRoute(path.relative(src, mdPath));
  const prose = scanMarkdown(readFileSync(mdPath, "utf8")).lines.filter((entry) => !entry.fenced);

  const definitions = new Map();
  for (const { line } of prose) {
    const m = definitionPattern.exec(line);
    if (m) definitions.set(m[1].trim().toLowerCase(), m[2]);
  }

  for (const { lineno, line } of prose) {
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

function linkExists(target) {
  const { route, frag } = resolveTarget(target, "/");
  const ids = routes.get(route);
  return Boolean(ids) && (!frag || ids.has(frag));
}

// A link a release put in the plugin stays in that release's installs for good, so every tag's
// links must keep landing — directly, or through a redirect written when the section moved.
const { paths: pluginLinks, releasesWithLinks } = linkedManualPaths(process.cwd());
const redirects = JSON.parse(readFileSync(path.join(src, ".vitepress", "redirects.json"), "utf8"));
const pluginFailures = [
  ...verifyRedirects(redirects, linkExists),
  ...verifyManualLinks(pluginLinks, redirects, linkExists),
];

for (const { mdPath, lineno, target } of unchecked) console.log(`UNCHECKED: ${mdPath}:${lineno} -> ${target}`);
for (const { mdPath, lineno, target } of failures) console.log(`DEAD: ${mdPath}:${lineno} -> ${target}`);
for (const { target, shippedIn, reason } of pluginFailures)
  console.log(
    `PLUGIN LINK: ${target} (${shippedIn ? `shipped in ${shippedIn}` : "unreleased"}) ${reason} — add an entry to docs/user/.vitepress/redirects.json pointing at where this is explained now`,
  );

console.log(`${unchecked.length} unchecked link(s)`);
console.log(`${failures.length} dead link(s)`);
console.log(
  `${pluginLinks.size} plugin link(s) checked, from ${releasesWithLinks} release(s) and the working tree; ${pluginFailures.length} failing`,
);
process.exit(failures.length + pluginFailures.length > 0 ? 1 : 0);
