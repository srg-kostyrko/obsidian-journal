import { type App } from "obsidian";

export async function ensureFolderExists(app: App, path: string): Promise<void> {
  if (!path) return;
  const directories = path.split("/");
  if (path.endsWith(".md")) {
    directories.pop();
  }
  if (directories.length > 0) {
    const folderPath = directories.join("/");
    if (!app.vault.getAbstractFileByPath(folderPath)) {
      await app.vault.createFolder(folderPath);
    }
  }
}
