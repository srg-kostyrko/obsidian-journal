import type { Plugin, TFile } from "obsidian";
import type { JournalsIndex } from "../journals/journals-index";
import type { JournalSettings } from "./settings.types";
import type { Journal } from "../journals/journal";

export interface JournalPlugin extends Plugin {
  readonly index: JournalsIndex;
  readonly activeNote: TFile | null;
  getJournal(name: string): Journal | undefined;
  createJournal(name: string, write: JournalSettings["write"]): JournalSettings;
  renameJournal(name: string, newName: string): void;
  removeJournal(name: string): void;

  createShelf(name: string): void;
  renameShelf(name: string, newName: string): void;
  removeShelf(name: string, destinationShelf?: string): void;
}
