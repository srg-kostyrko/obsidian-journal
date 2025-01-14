import type { Plugin, TFile } from "obsidian";
import type { JournalsIndex } from "../journals/journals-index";
import type { JournalSettings, NotesProcessing, PluginSettings, ShelfSettings } from "./settings.types";
import type { Journal } from "../journals/journal";

export interface JournalPlugin extends Plugin {
  readonly calendarSettings: PluginSettings["calendar"];
  readonly calendarViewSettings: PluginSettings["calendarView"];
  readonly uiSettings: PluginSettings["ui"];
  readonly showReloadHint: boolean;
  requestReloadHint(): void;

  readonly index: JournalsIndex;
  readonly activeNote: TFile | null;
  readonly journals: Journal[];
  hasJournal(name: string): boolean;
  getJournal(name: string): Journal | undefined;
  getJournalConfig(name: string): JournalSettings;
  createJournal(name: string, write: JournalSettings["write"]): JournalSettings;
  renameJournal(name: string, newName: string): Promise<void>;
  removeJournal(name: string, notesProcessing: NotesProcessing): Promise<void>;

  usesShelves: boolean;
  openOnStartup: string;
  readonly shelves: ShelfSettings[];
  hasShelf(name: string): boolean;
  getShelf(name: string): ShelfSettings | undefined;
  createShelf(name: string): void;
  renameShelf(name: string, newName: string): void;
  removeShelf(name: string, destinationShelf?: string): void;

  moveJournal(journalName: string, destinationShelf: string): void;
}
