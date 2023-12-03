import { FrontMatterCache, Plugin } from "obsidian";
import { JournalFrontMatter } from "./config.types";

export interface Journal {
  name: string;
  autoCreateNotes(): Promise<void>;
  openStartupNote(): Promise<void>;
  configureRibbonIcons(plugin: Plugin): void;
  parseFrontMatter(frontmatter: FrontMatterCache): JournalFrontMatter;
  indexNote(frontmatter: JournalFrontMatter, path: string): void;
  clearForPath(path: string): void;
  supportsCommand(id: string): boolean;
  execCommand(id: string): Promise<void>;
}
