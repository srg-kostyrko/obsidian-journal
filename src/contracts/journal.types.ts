import { FrontMatterCache, Plugin } from "obsidian";
import { JournalFrontMatter } from "./config.types";

export interface Journal {
  type: string;
  name: string;
  autoCreateNotes(): Promise<void>;
  openStartupNote(): Promise<void>;
  openPath(path: string, frontmatter: JournalFrontMatter): Promise<void>;
  configureRibbonIcons(plugin: Plugin): void;
  parseFrontMatter(frontmatter: FrontMatterCache): JournalFrontMatter;
  indexNote(frontmatter: JournalFrontMatter, path: string): void;
  clearForPath(path: string): void;
  supportsCommand(id: string): boolean;
  execCommand(id: string): Promise<void>;

  findNextNote(data: JournalFrontMatter): Promise<string | null>;
  findPreviousNote(data: JournalFrontMatter): Promise<string | null>;

  disconnectNote(path: string): Promise<void>;

  clearNotes(): Promise<void>;
  deleteNotes(): Promise<void>;
}

export type NotesProcessing = "keep" | "clear" | "delete";
