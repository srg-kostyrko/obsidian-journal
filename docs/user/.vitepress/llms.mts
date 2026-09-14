import { readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { SiteConfig } from "vitepress";
import { isDarkOnlyImage, markdownFiles, scanMarkdown, stripHeadingId } from "../../../scripts/docs-markdown.mjs";

function firstHeading(body: string, fallback: string): string {
  return /^#\s+(.+)$/m.exec(body)?.[1] ?? fallback;
}

// The ::: v-pre markers and the dark copy of each screenshot are noise to an agent; the content is not.
function stripForAgents(body: string, file: string): string {
  const { lines, unclosedVPre } = scanMarkdown(body);
  if (unclosedVPre) throw new Error(`unclosed "::: v-pre" container in ${file}`);
  return lines
    .filter((entry) => !entry.vPreMarker && (entry.fenced || !isDarkOnlyImage(entry.line)))
    .map((entry) => (entry.fenced ? entry.line : stripHeadingId(entry.line)))
    .join("\n");
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

// index.md first, then sidebar order, then any page the sidebar does not link — never dropped.
function orderPages<T extends { route: string }>(pages: T[], routes: string[]): T[] {
  const byRoute = new Map(pages.map((page) => [page.route, page] as const));
  const ordered: T[] = [];
  const seen = new Set<string>();

  for (const route of ["", ...routes]) {
    const page = byRoute.get(route);
    if (!page || seen.has(route)) continue;
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
  const site = new URL(config.site.base, "https://srg-kostyrko.github.io");
  const pages = await Promise.all(
    markdownFiles(config.srcDir).map(async (file) => {
      const rel = relative(config.srcDir, file);
      const body = stripForAgents(await readFile(file, "utf8"), rel);
      const route = rel.replace(/(?:index)?\.md$/, "");
      return { route, title: firstHeading(body, route), body };
    }),
  );
  const orderedPages = orderPages(pages, sidebarRoutes(config));

  const index = [
    "# Journals for Obsidian",
    "",
    "> User manual for the Journals plugin for Obsidian.",
    "",
    ...orderedPages.map((page) => `- [${page.title}](${new URL(page.route, site).href})`),
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
