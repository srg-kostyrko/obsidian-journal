import type { Plugin } from "obsidian";
import type { JournalsIndex } from "../journals/journals-index";
import type { JournalSettings } from "./settings.types";
import type { Journal } from "../journals/journal";

export interface JournalPlugin extends Plugin {
  readonly index: JournalsIndex;
  getJournal(id: string): Journal | undefined;
  createJournal(id: string, name: string, write: JournalSettings["write"]): void;
  removeJournal(id: string): void;
}
