import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Journals for Obsidian",
  description: "User manual for the Journals plugin for Obsidian",
  base: "/obsidian-journal/",
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    nav: [{ text: "Manual", link: "/journals" }],
    sidebar: [
      {
        text: "Journals",
        items: [{ text: "Overview", link: "/" }],
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
