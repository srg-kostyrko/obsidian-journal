import type { Plugin } from "obsidian";
import type { JournalsIndex } from "../journals/journals-index";
import type { JournalSettings } from "./settings.types";

export interface JournalPlugin extends Plugin {
  readonly index: JournalsIndex;
  createJournal(id: string, name: string, write: JournalSettings["write"]): void;
  removeJournal(id: string): void;
}
