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

const CONTAINER_OPEN = /^(:{3,})\s*(\S.*)?$/;
const CONTAINER_CLOSE = /^(:{3,})\s*$/;

interface ContainerFrame {
  colons: number;
  isVPre: boolean;
}

/**
 * Strips VitePress `::: v-pre` … `:::` container markers, keeping their content.
 * Only `v-pre` containers are stripped — every other container (`::: tip`, a `::: tip`
 * nested inside a `v-pre`, …) passes through untouched, matched and paired the way
 * markdown-it-container does: by a stack of open fences, closed by a fence whose colon
 * run is at least as long as the one it closes. Fenced code blocks are tracked so a
 * `:::` inside one is never treated as a container marker.
 */
function stripVPre(body: string, file: string): string {
  const lines = body.split("\n");
  const result: string[] = [];
  let inCodeFence = false;
  const stack: ContainerFrame[] = [];

  for (const line of lines) {
    if (line.startsWith("```")) {
      inCodeFence = !inCodeFence;
      result.push(line);
      continue;
    }

    if (!inCodeFence) {
      const closeMatch = CONTAINER_CLOSE.exec(line);
      const top = stack.at(-1);
      if (closeMatch && top && closeMatch[1].length >= top.colons) {
        stack.pop();
        if (!top.isVPre) result.push(line);
        continue;
      }

      const openMatch = CONTAINER_OPEN.exec(line);
      if (openMatch) {
        const isVPre = openMatch[2]?.trim() === "v-pre";
        stack.push({ colons: openMatch[1].length, isVPre });
        if (!isVPre) result.push(line);
        continue;
      }
    }

    result.push(line);
  }

  if (stack.some((frame) => frame.isVPre)) {
    throw new Error(`unclosed "::: v-pre" container in ${file}`);
  }

  return result.join("\n");
}

interface SidebarItemLike {
  link?: string;
  items?: SidebarItemLike[];
}

function linkToRoute(link: string): string {
  const trimmed = link.replace(/^\//, "").replace(/\/$/, "");
  return trimmed === "index" ? "" : trimmed;
}

function walkSidebarItems(items: SidebarItemLike[] | undefined, routes: string[]): void {
  if (!items) return;
  for (const item of items) {
    if (item.link) routes.push(linkToRoute(item.link));
    walkSidebarItems(item.items, routes);
  }
}

/** Reads the sidebar straight off the resolved theme config, so it can never drift from it. */
function sidebarRoutes(config: SiteConfig): string[] {
  const sidebar = (config.site.themeConfig as { sidebar?: unknown } | undefined)?.sidebar;
  const routes: string[] = [];
  if (Array.isArray(sidebar)) {
    walkSidebarItems(sidebar as SidebarItemLike[], routes);
  } else if (sidebar && typeof sidebar === "object") {
    for (const value of Object.values(sidebar as Record<string, unknown>)) {
      const items = Array.isArray(value) ? value : ((value as { items?: unknown })?.items ?? undefined);
      if (Array.isArray(items)) walkSidebarItems(items as SidebarItemLike[], routes);
    }
  }
  return routes;
}

/**
 * `index.md` first, then every page the sidebar links in sidebar order, then any
 * remaining page (not linked from the sidebar) appended alphabetically — the order an
 * agent reading top to bottom should see, matching the site's own nav.
 */
function orderPages<T extends { route: string }>(pages: T[], routes: string[]): T[] {
  const byRoute = new Map(pages.map((page) => [page.route, page] as const));
  const ordered: T[] = [];
  const seen = new Set<string>();

  const index = byRoute.get("");
  if (index) {
    ordered.push(index);
    seen.add("");
  }

  for (const route of routes) {
    if (seen.has(route)) continue;
    const page = byRoute.get(route);
    if (!page) continue;
    ordered.push(page);
    seen.add(route);
  }

  for (const page of pages) {
    if (seen.has(page.route)) continue;
    ordered.push(page);
    seen.add(page.route);
  }

  return ordered;
}

export async function emitLlmsTxt(config: SiteConfig): Promise<void> {
  const files = await markdownFiles(config.srcDir);
  const pages = await Promise.all(
    files.map(async (file) => {
      const body = await readFile(file, "utf8");
      const route = relative(config.srcDir, file).replace(/(?:index)?\.md$/, "");
      return { route, title: firstHeading(body, route), body: stripVPre(body, relative(config.srcDir, file)) };
    }),
  );
  const orderedPages = orderPages(pages, sidebarRoutes(config));

  const index = [
    "# Journals for Obsidian",
    "",
    "> User manual for the Journals plugin for Obsidian.",
    "",
    ...orderedPages.map((page) => `- [${page.title}](${SITE}/${page.route})`),
    "",
  ].join("\n");

  const full = [
    "# Journals for Obsidian — complete user manual",
    "",
    ...orderedPages.map((page) => `${page.body.trim()}\n`),
  ].join("\n");

  await writeFile(join(config.outDir, "llms.txt"), index, "utf8");
  await writeFile(join(config.outDir, "llms-full.txt"), full, "utf8");
}
