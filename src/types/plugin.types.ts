import type { JournalSettings } from "./settings.types";

export interface JournalPlugin {
  createJournal(id: string, name: string, write: JournalSettings["write"]): void;
  removeJournal(id: string): void;
}
