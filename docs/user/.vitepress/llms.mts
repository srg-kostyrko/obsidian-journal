import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { SiteConfig } from "vitepress";

const SITE = "https://srg-kostyrko.github.io/obsidian-journal";

async function markdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found = await Promise.all(
    entries.map(async (entry) => {
      if (entry.name.startsWith(".")) return [];
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return markdownFiles(full);
      return entry.name.endsWith(".md") ? [full] : [];
    }),
  );
  return found.flat().sort();
}

function firstHeading(body: string, fallback: string): string {
  return /^#\s+(.+)$/m.exec(body)?.[1] ?? fallback;
}

/**
 * Strips VitePress `::: v-pre` … `:::` container markers, keeping their content.
 * Only the `v-pre` container is stripped — other container types (`::: tip`, …) pass
 * through untouched. Tracks fenced-code state so a `:::` inside a code fence is never
 * treated as a closing marker.
 */
function stripVPre(body: string): string {
  const lines = body.split("\n");
  const result: string[] = [];
  let inCodeFence = false;
  let awaitingClose = false;

  for (const line of lines) {
    if (line.startsWith("```")) inCodeFence = !inCodeFence;

    if (!inCodeFence && !awaitingClose && line === "::: v-pre") {
      awaitingClose = true;
      continue;
    }
    if (!inCodeFence && awaitingClose && line === ":::") {
      awaitingClose = false;
      continue;
    }
    result.push(line);
  }

  return result.join("\n");
}

export async function emitLlmsTxt(config: SiteConfig): Promise<void> {
  const files = await markdownFiles(config.srcDir);
  const pages = await Promise.all(
    files.map(async (file) => {
      const body = await readFile(file, "utf8");
      const route = relative(config.srcDir, file).replace(/(?:index)?\.md$/, "");
      return { route, title: firstHeading(body, route), body: stripVPre(body) };
    }),
  );

  const index = [
    "# Journals for Obsidian",
    "",
    "> User manual for the Journals plugin for Obsidian.",
    "",
    ...pages.map((page) => `- [${page.title}](${SITE}/${page.route})`),
    "",
  ].join("\n");

  const full = [
    "# Journals for Obsidian — complete user manual",
    "",
    ...pages.map((page) => `${page.body.trim()}\n`),
  ].join("\n");

  await writeFile(join(config.outDir, "llms.txt"), index, "utf8");
  await writeFile(join(config.outDir, "llms-full.txt"), full, "utf8");
}
