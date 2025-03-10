import { Menu, type LeftRibbon } from "obsidian";
import type { AppManager, JournalPlugin } from "./types/plugin.types";

export class ObsidianManager implements AppManager {
  #ribbons = new Map<string, HTMLElement>();

  constructor(private plugin: JournalPlugin) {}

  addCommand(
    journalName: string,
    command: { name: string; icon: string },
    checkCallback: (checking: boolean) => boolean,
  ): void {
    this.plugin.addCommand({
      id: this.#prepareId(journalName + ":" + command.name),
      name: journalName ? `${journalName}: ${command.name}` : command.name,
      icon: command.icon,
      checkCallback,
    });
  }

  removeCommand(prefix: string, command: { name: string; icon: string }): void {
    this.plugin.removeCommand(this.#prepareId(prefix + ":" + command.name));
  }

  addRibbonIcon(prefix: string, icon: string, tooltip: string, action: () => void): string {
    const ribbonId = this.#prepareId("journals:" + prefix + ":" + tooltip);
    const item = (this.plugin.app.workspace.leftRibbon as LeftRibbon).addRibbonItemButton(
      ribbonId,
      icon,
      tooltip,
      action,
    );
    this.#ribbons.set(ribbonId, item);
    return ribbonId;
  }

  removeRibbonIcon(journalName: string, tooltip: string): string {
    const id = this.#prepareId("journals:" + journalName + ":" + tooltip);
    (this.plugin.app.workspace.leftRibbon as LeftRibbon).removeRibbonAction(id);
    this.#ribbons.get(id)?.detach();
    this.#ribbons.delete(id);
    return id;
  }

  showContextMenu(path: string, event: MouseEvent): void {
    const file = this.plugin.app.vault.getAbstractFileByPath(path);
    if (file) {
      const menu = new Menu();
      this.plugin.app.workspace.trigger("file-menu", menu, file, "file-explorer-context-menu", null);
      menu.addItem((item) =>
        item
          .setTitle("Delete")
          .setIcon("trash")
          .onClick(() => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
            (this.plugin.app.fileManager as any).promptForFileDeletion(file);
          }),
      );
      menu.showAtMouseEvent(event);
    }
  }

  showPreview(path: string, event: MouseEvent): void {
    this.plugin.app.workspace.trigger("link-hover", this.plugin, event.target, path, path);
  }

  #prepareId(id: string): string {
    return id.replaceAll(/\s/gi, "-").toLocaleLowerCase();
  }

  dispose(): void {
    for (const item of this.#ribbons.values()) item.detach();
    this.#ribbons.clear();
  }
}
