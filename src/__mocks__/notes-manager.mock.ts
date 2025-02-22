import type { NotesManager } from "@/types/plugin.types";
import type { TFile, CachedMetadata, PaneType, WorkspaceLeaf } from "obsidian";

export class NotesManagerMock implements NotesManager {
  #notes = new Map<
    string,
    {
      metadata: CachedMetadata | null;
      content: string;
    }
  >();
  #openedNotes = new Map<string, PaneType | undefined>();

  normalizePath(path: string) {
    return path;
  }

  getNotesInFolder(_folderPath: string): string[] {
    throw new Error("Method not implemented.");
  }

  getNoteName(path: string): string {
    const filename = path.split("/").pop();
    const name = filename?.split(".").pop();
    return name ?? "";
  }

  getNoteFilename(path: string): string {
    const filename = path.split("/").pop();
    return filename ?? "";
  }

  getNoteFolder(path: string): string {
    const parts = path.split("/");
    parts.pop();
    return parts.join("/");
  }

  getMarkdownFiles(): TFile[] {
    throw new Error("Method not implemented.");
  }

  nodeExists(path: string): boolean {
    return this.#notes.has(path);
  }

  getNoteMetadata(path: string): CachedMetadata | null {
    return this.#notes.get(path)?.metadata ?? null;
  }

  createNote(path: string, content: string): Promise<void> {
    this.#notes.set(path, {
      metadata: null,
      content,
    });
    return Promise.resolve();
  }

  appendNote(path: string, content: string): Promise<void> {
    const noteData = this.#notes.get(path);
    if (!noteData) return Promise.resolve();
    noteData.content += content;
    return Promise.resolve();
  }

  updateNote(path: string, content: string): Promise<void> {
    const noteData = this.#notes.get(path);
    if (!noteData) return Promise.resolve();
    noteData.content = content;
    return Promise.resolve();
  }
  renameNote(path: string, newPath: string): Promise<void> {
    const noteData = this.#notes.get(path);
    if (!noteData) return Promise.resolve();
    this.#notes.set(newPath, noteData);
    this.#notes.delete(path);
    return Promise.resolve();
  }

  deleteNote(path: string): Promise<void> {
    this.#notes.delete(path);
    return Promise.resolve();
  }

  updateNoteFrontmatter(path: string, action: (frontmatter: Record<string, unknown>) => void): Promise<void> {
    const noteData = this.#notes.get(path);
    if (!noteData) return Promise.resolve();
    const frontmatter = noteData.metadata?.frontmatter ?? {};
    action(frontmatter);
    noteData.metadata = { frontmatter };
    return Promise.resolve();
  }

  openNote(path: string, mode?: PaneType): Promise<void> {
    this.#openedNotes.set(path, mode);
    return Promise.resolve();
  }
  findOpenedNote(_path: string): WorkspaceLeaf | null {
    throw new Error("Method not implemented.");
  }
  confirmNoteCreation(_journalName: string, _noteName: string): Promise<boolean> {
    throw new Error("Method not implemented.");
  }

  getNoteContent(_path: string): Promise<string> {
    throw new Error("Method not implemented.");
  }
  tryApplyingTemplater(_templatePath: string, _notePath: string, _content: string): Promise<string> {
    throw new Error("Method not implemented.");
  }
  tryTemplaterCursorJump(_notePath: string): Promise<boolean> {
    throw new Error("Method not implemented.");
  }

  // #region mock methods
  registerNote(path: string, content: string, frontmatter?: Record<string, unknown>) {
    this.#notes.set(path, {
      metadata: { frontmatter },
      content,
    });
  }
  unregisterNote(path: string) {
    this.#notes.delete(path);
  }

  wasNoteOpened(path: string): boolean {
    return this.#openedNotes.has(path);
  }
  wasNoteOpenedWithMode(path: string, mode: PaneType): boolean {
    return this.#openedNotes.get(path) === mode;
  }
  // #endregion
}
