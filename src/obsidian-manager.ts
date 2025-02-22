import type { LeftRibbon } from "obsidian";
import type { AppManager, JournalPlugin } from "./types/plugin.types";
import type { JournalCommand } from "./types/settings.types";

export class ObsidianManager implements AppManager {
  #ribbons = new Map<string, HTMLElement>();

  constructor(private plugin: JournalPlugin) {}

  addCommand(journalName: string, command: JournalCommand, checkCallback: (checking: boolean) => boolean): void {
    this.plugin.addCommand({
      id: journalName + ":" + command.name,
      name: `${journalName}: ${command.name}`,
      icon: command.icon,
      checkCallback,
    });
  }

  removeCommand(journalName: string, command: JournalCommand): void {
    this.plugin.removeCommand(journalName + ":" + command.name);
  }

  addRibbonIcon(journalName: string, icon: string, tooltip: string, action: () => void): string {
    const ribbonId = "journals:" + journalName + ":" + tooltip;
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
    const id = "journals:" + journalName + ":" + tooltip;
    (this.plugin.app.workspace.leftRibbon as LeftRibbon).removeRibbonAction(id);
    this.#ribbons.get(id)?.detach();
    this.#ribbons.delete(id);
    return id;
  }

  dispose(): void {
    for (const item of this.#ribbons.values()) item.detach();
    this.#ribbons.clear();
  }
}
