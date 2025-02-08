import type { CachedMetadata, PaneType, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import type { JournalsIndex } from "../journals/journals-index";
import type { JournalCommand, JournalSettings, NotesProcessing, PluginSettings, ShelfSettings } from "./settings.types";
import type { Journal } from "../journals/journal";
import type { PendingMigration } from "./migration.types";

export interface JournalPlugin extends Plugin {
  readonly calendarSettings: PluginSettings["calendar"];
  readonly calendarViewSettings: PluginSettings["calendarView"];
  readonly uiSettings: PluginSettings["ui"];
  readonly showReloadHint: boolean;
  readonly notesManager: NotesManager;
  requestReloadHint(): void;

  readonly index: JournalsIndex;
  readonly activeNote: string | null;
  readonly journals: Journal[];
  hasJournal(name: string): boolean;
  getJournal(name: string): Journal | undefined;
  getJournalConfig(name: string): JournalSettings;
  createJournal(name: string, write: JournalSettings["write"]): JournalSettings;
  registerJournal(settings: JournalSettings): Journal;
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

  disconnectNote(path: string): Promise<void>;

  readonly pendingMigrations: PendingMigration[];
}

export interface NotesManager {
  getMarkdownFiles(): TFile[];
  getNoteMetadata(path: string): CachedMetadata | null;
  nodeExists(path: string): boolean;
  updateNoteFrontmatter(path: string, action: (frontmatter: Record<string, unknown>) => void): Promise<void>;
  deleteNote(path: string): Promise<void>;
  openNote(path: string, mode?: PaneType): Promise<void>;
  findOpenedNote(path: string): WorkspaceLeaf | null;
  confirmNoteCreation(journalName: string, noteName: string): Promise<boolean>;
  createNote(path: string, content: string): Promise<void>;
  updateNote(path: string, content: string): Promise<void>;
  renameNote(path: string, newPath: string): Promise<void>;
  getNoteContent(path: string): Promise<string>;
  tryApplyingTemplater(templatePath: string, notePath: string, content: string): Promise<string>;
}

export interface AppManager {
  addCommand(journalName: string, command: JournalCommand, checkCallback: (checking: boolean) => void): void;
  removeCommand(journalName: string, command: JournalCommand): void;
  addRibbonIcon(journalName: string, icon: string, tooltip: string, action: () => void): string;
  removeRibbonIcon(journalName: string, icon: string): string;
}
