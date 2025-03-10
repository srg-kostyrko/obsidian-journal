import type { CachedMetadata, PaneType, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import type { JournalsIndex } from "../journals/journals-index";
import type { JournalSettings, NotesProcessing, PluginCommand, PluginSettings, ShelfSettings } from "./settings.types";
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
  readonly dismissedNotifications: string[];
  dismissNotification(id: string): void;
  requestReloadHint(): void;
  reprocessNotes(): void;

  readonly index: JournalsIndex;
  readonly activeNote: string | null;
  readonly journals: Journal[];
  readonly commands: PluginCommand[];
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
  getShelfJournals(name: string): Journal[];

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
  addCommand(
    prefix: string,
    command: { name: string; icon: string },
    checkCallback: (checking: boolean) => boolean,
  ): void;
  removeCommand(prefix: string, command: { name: string; icon: string }): void;
  addRibbonIcon(prefix: string, icon: string, tooltip: string, action: () => void): string;
  removeRibbonIcon(journalName: string, tooltip: string): string;
  showContextMenu(path: string, event: MouseEvent): void;
  showPreview(path: string, event: MouseEvent): void;
}
