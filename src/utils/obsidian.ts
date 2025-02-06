import type { App, MarkdownView } from "obsidian";

export function findOpenedNote(app: App, path: string) {
  for (const leaf of app.workspace.getLeavesOfType("markdown")) {
    const { file } = leaf.view as MarkdownView;
    if (!file) continue;
    if (file.path === path) return leaf;
  }
  return null;
}
