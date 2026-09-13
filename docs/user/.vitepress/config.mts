import { defineConfig } from "vitepress";
import { emitLlmsTxt } from "./llms.mts";

export default defineConfig({
  title: "Journals for Obsidian",
  description: "User manual for the Journals plugin for Obsidian",
  base: "/obsidian-journal/",
  cleanUrls: true,
  lastUpdated: true,
  buildEnd: emitLlmsTxt,
  themeConfig: {
    nav: [{ text: "Manual", link: "/journals" }],
    sidebar: [
      {
        text: "Using Journals",
        items: [
          { text: "Journals", link: "/journals" },
          { text: "Shelves", link: "/shelves" },
          { text: "Questions", link: "/questions" },
          { text: "Notelets", link: "/notelets" },
          { text: "Decorations", link: "/decorations" },
          { text: "Views and blocks", link: "/views-and-blocks" },
          { text: "Commands", link: "/commands" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Settings", link: "/settings" },
          { text: "Variables", link: "/reference/variables" },
          { text: "Code blocks", link: "/reference/code-blocks" },
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
