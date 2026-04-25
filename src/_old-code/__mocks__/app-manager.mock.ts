import type { AppManager } from "@/types/plugin.types";
import type { JournalCommand } from "@/types/settings.types";

export class AppManagerMock implements AppManager {
  #commands = new Map<string, { command: JournalCommand; callback: (checking: boolean) => boolean }>();
  #icons = new Map<string, { icon: string; action: () => void }>();
  addCommand(journalName: string, command: JournalCommand, callback: (checking: boolean) => boolean): void {
    this.#commands.set(`${journalName}--${command.name}`, { command, callback });
  }

  removeCommand(journalName: string, command: JournalCommand): void {
    this.#commands.delete(`${journalName}--${command.name}`);
  }

  addRibbonIcon(journalName: string, icon: string, tooltip: string, action: () => void): string {
    const ribbonId = journalName + "--" + tooltip;
    this.#icons.set(ribbonId, { icon, action });
    return ribbonId;
  }

  removeRibbonIcon(journalName: string, tooltip: string): string {
    const ribbonId = journalName + "--" + tooltip;
    this.#icons.delete(ribbonId);
    return ribbonId;
  }

  showContextMenu(_path: string, _event: MouseEvent): void {
    throw new Error("Method not implemented.");
  }
  showPreview(_path: string, _event: MouseEvent): void {
    throw new Error("Method not implemented.");
  }

  //#region mock methods
  hasCommand(journalName: string, command: JournalCommand): boolean {
    return this.#commands.has(`${journalName}--${command.name}`);
  }
  checkCommand(journalName: string, command: JournalCommand): boolean {
    return this.#commands.get(`${journalName}--${command.name}`)?.callback(true) ?? false;
  }
  executeCommand(journalName: string, command: JournalCommand): void {
    this.#commands.get(`${journalName}--${command.name}`)?.callback(false);
  }
  hasRibbonIcon(journalName: string, tooltip: string): boolean {
    return this.#icons.has(journalName + "--" + tooltip);
  }
  executeRibbonIcon(journalName: string, tooltip: string): void {
    this.#icons.get(journalName + "--" + tooltip)?.action();
  }
  //#endregion
}
