import type { Plugin } from "obsidian";
import type { JournalsIndex } from "../journals/journals-index";
import type { JournalSettings } from "./settings.types";
import type { Journal } from "../journals/journal";

export interface JournalPlugin extends Plugin {
  readonly index: JournalsIndex;
  getJournal(name: string): Journal | undefined;
  createJournal(name: string, write: JournalSettings["write"]): void;
  renameJournal(name: string, newName: string): void;
  removeJournal(name: string): void;
}
