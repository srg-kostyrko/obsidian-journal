import type { CachedMetadata, PaneType, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import type { JournalsIndex } from "../journals/journals-index";
import type { JournalCommand, JournalSettings, NotesProcessing, PluginSettings, ShelfSettings } from "./settings.types";
import type { Journal } from "../journals/journal";
import type { PendingMigration } from "./migration.types";

export interface JournalPlugin extends Plugin {
  readonly hasMigrations: boolean;

  readonly calendarSettings: PluginSettings["calendar"];
  readonly calendarViewSettings: PluginSettings["calendarView"];
  readonly uiSettings: PluginSettings["ui"];
  readonly showReloadHint: boolean;
  readonly notesManager: NotesManager;
  readonly appManager: AppManager;
  requestReloadHint(): void;
  reprocessNotes(): void;

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
  normalizePath(path: string): string;
  getMarkdownFiles(): TFile[];
  getNotesInFolder(folderPath: string): string[];
  getNoteName(path: string): string;
  getNoteFilename(path: string): string;
  getNoteFolder(path: string): string;
  getNoteMetadata(path: string): CachedMetadata | null;
  nodeExists(path: string): boolean;
  updateNoteFrontmatter(path: string, action: (frontmatter: Record<string, unknown>) => void): Promise<void>;
  deleteNote(path: string): Promise<void>;
  openNote(path: string, mode?: PaneType): Promise<void>;
  findOpenedNote(path: string): WorkspaceLeaf | null;
  confirmNoteCreation(journalName: string, noteName: string): Promise<boolean>;
  createNote(path: string, content: string): Promise<void>;
  updateNote(path: string, content: string): Promise<void>;
  appendNote(path: string, content: string): Promise<void>;
  renameNote(path: string, newPath: string): Promise<void>;
  getNoteContent(path: string): Promise<string>;
  tryApplyingTemplater(templatePath: string, notePath: string, content: string): Promise<string>;
  tryTemplaterCursorJump(notePath: string): Promise<boolean>;
}

export interface AppManager {
  addCommand(journalName: string, command: JournalCommand, checkCallback: (checking: boolean) => boolean): void;
  removeCommand(journalName: string, command: JournalCommand): void;
  addRibbonIcon(journalName: string, icon: string, tooltip: string, action: () => void): string;
  removeRibbonIcon(journalName: string, tooltip: string): string;
  showContextMenu(path: string, event: MouseEvent): void;
  showPreview(path: string, event: MouseEvent): void;
}
