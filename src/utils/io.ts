import { type App } from "obsidian";

export async function ensureFolderExists(app: App, path: string): Promise<void> {
  if (!path) return;
  const dirs = path.split("/");
  if (path.endsWith(".md")) {
    dirs.pop();
  }
  if (dirs.length) {
    const folderPath = dirs.join("/");
    if (!app.vault.getAbstractFileByPath(folderPath)) {
      await app.vault.createFolder(folderPath);
    }
  }
}
