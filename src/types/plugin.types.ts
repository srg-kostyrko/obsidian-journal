import type { JournalsIndex } from "../journals/journals-index";
import type { JournalSettings } from "./settings.types";

export interface JournalPlugin {
  readonly index: JournalsIndex;
  createJournal(id: string, name: string, write: JournalSettings["write"]): void;
  removeJournal(id: string): void;
}
