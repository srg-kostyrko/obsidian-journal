import { App } from "obsidian";

export async function ensureFolderExists(app: App, path: string): Promise<void> {
  if (!path) return;
  const dirs = path.split("/");
  if (dirs.length) {
    if (!app.vault.getAbstractFileByPath(path)) {
      console.log(path);
      await app.vault.createFolder(path);
    }
  }
}
