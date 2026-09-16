import { defineConfig } from "vitepress";
import { emitLlmsTxt } from "./llms.mts";

export default defineConfig({
  title: "Journals for Obsidian",
  description: "User manual for the Journals plugin for Obsidian",
  base: "/obsidian-journal/",
  cleanUrls: true,
  lastUpdated: true,
  buildEnd: emitLlmsTxt,
  // The released manual is the one the plugin deep-links into and the one a search result should
  // reach; `/next/` describes behavior nobody can install yet. Read off the base the build was
  // actually given rather than a flag of its own, which could be set without it.
  transformHead: ({ siteData }) =>
    siteData.base.endsWith("/next/") ? [["meta", { name: "robots", content: "noindex" }]] : [],
  themeConfig: {
    nav: [{ text: "Manual", link: "/" }],
    sidebar: [
      {
        text: "Basics",
        items: [
          { text: "Periods", link: "/periods" },
          { text: "Journals", link: "/journals" },
          { text: "Notes", link: "/notes" },
          { text: "Views", link: "/views" },
          { text: "Navigation blocks", link: "/navigation-blocks" },
        ],
      },
      {
        text: "Going further",
        items: [
          { text: "Shelves", link: "/shelves" },
          { text: "Questions", link: "/questions" },
          { text: "Notelets", link: "/notelets" },
          { text: "Decorations", link: "/decorations" },
          { text: "Commands", link: "/commands" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Settings", link: "/settings" },
          { text: "Variables", link: "/reference/variables" },
          { text: "Code blocks", link: "/reference/code-blocks" },
          { text: "Links", link: "/reference/links" },
          { text: "Glossary", link: "/reference/glossary" },
        ],
      },
      {
        text: "Help",
        items: [
          { text: "Compatibility", link: "/compatibility" },
          { text: "Troubleshooting", link: "/troubleshooting" },
        ],
      },
      {
        text: "Guides",
        items: [
          { text: "Coming from Periodic Notes", link: "/guides/from-periodic-notes" },
          { text: "Coming from Calendar", link: "/guides/from-calendar" },
          { text: "Setup examples", link: "/guides/setup-examples" },
        ],
      },
    ],
    search: { provider: "local" },
    socialLinks: [{ icon: "github", link: "https://github.com/srg-kostyrko/obsidian-journal" }],
    editLink: {
      pattern: "https://github.com/srg-kostyrko/obsidian-journal/edit/main/docs/user/:path",
      text: "Edit this page on GitHub",
    },
  },
});
