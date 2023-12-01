import { App, FrontMatterCache, Plugin } from "obsidian";
import { CalerndatFrontMatter, IntervalConfig } from "../contracts/config.types";
import { CalendarHelper } from "../utils/calendar";
import { Journal } from "../contracts/journal.types";

export class IntervalJournal implements Journal {
  constructor(
    private app: App,
    public readonly config: IntervalConfig,
    private calendar: CalendarHelper,
  ) {}

  autoCreateNotes(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  openStartupNote(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  configureRibbonIcons(_plugin: Plugin): void {
    throw new Error("Method not implemented.");
  }
  parseFrontMatter(_frontmatter: FrontMatterCache): CalerndatFrontMatter {
    throw new Error("Method not implemented.");
  }
  indexNote(_frontmatter: CalerndatFrontMatter, _path: string): void {
    throw new Error("Method not implemented.");
  }
  clearForPath(_path: string): void {
    throw new Error("Method not implemented.");
  }
}
