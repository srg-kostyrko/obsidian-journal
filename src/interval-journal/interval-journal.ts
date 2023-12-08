import { App, FrontMatterCache, Plugin, TFile } from "obsidian";
import { IntervalConfig, IntervalFrontMatter } from "../contracts/config.types";
import { CalendarHelper } from "../utils/calendar";
import { Journal } from "../contracts/journal.types";
import {
  FRONTMATTER_DATE_FORMAT,
  FRONTMATTER_END_DATE_KEY,
  FRONTMATTER_ID_KEY,
  FRONTMATTER_INDEX_KEY,
  FRONTMATTER_START_DATE_KEY,
} from "../constants";
import { TemplateContext } from "../contracts/template.types";
import { replaceTemplateVariables } from "../utils/template";
import { ensureFolderExists } from "../utils/io";
import { Interval, IntervalManager } from "./interval-manager";

export const intervalCommands = {
  "interval-journal:open": "Open current interval",
  "interval-journal:open-next": "Open next interval",
  "interval-journal:open-prev": "Open previous interval",
};

export class IntervalJournal implements Journal {
  public readonly intervals: IntervalManager;
  constructor(
    private app: App,
    public readonly config: IntervalConfig,
    private calendar: CalendarHelper,
  ) {
    this.intervals = new IntervalManager(this.config, this.calendar);
  }

  get id(): string {
    return this.config.id;
  }

  get name(): string {
    return this.config.name;
  }

  findInterval(date?: string): Interval {
    return this.intervals.findInterval(date);
  }
  findNextInterval(date?: string): Interval {
    return this.intervals.findNextInterval(date);
  }

  findPreviousInterval(date?: string): Interval {
    return this.intervals.findPreviousInterval(date);
  }

  async open(date?: string): Promise<void> {
    return await this.openInterval(this.findInterval(date));
  }

  async openNext(date?: string): Promise<void> {
    return await this.openInterval(this.intervals.findNextInterval(date));
  }

  async openPrev(date?: string): Promise<void> {
    return await this.openInterval(this.intervals.findPreviousInterval(date));
  }

  async autoCreateNotes(): Promise<void> {
    if (!this.config.createOnStartup) return;
    await this.ensureIntervalNote(this.findInterval());
  }

  async openStartupNote(): Promise<void> {
    if (!this.config.openOnStartup) return;
    this.open();
  }

  configureRibbonIcons(plugin: Plugin): void {
    if (!this.config.ribbon.show) return;
    plugin.addRibbonIcon(
      this.config.ribbon.icon || "calendar-range",
      this.config.ribbon.tooltip || `Open current ${this.config.name} note`,
      () => {
        this.open();
      },
    );
  }

  parseFrontMatter(frontmatter: FrontMatterCache): IntervalFrontMatter {
    return {
      type: "interval",
      id: this.id,
      start_date: frontmatter[FRONTMATTER_START_DATE_KEY],
      end_date: frontmatter[FRONTMATTER_END_DATE_KEY],
      index: frontmatter[FRONTMATTER_INDEX_KEY],
    };
  }

  indexNote(frontmatter: IntervalFrontMatter, path: string): void {
    const startDate = this.calendar.date(frontmatter.start_date, FRONTMATTER_DATE_FORMAT);
    const endDate = this.calendar.date(frontmatter.end_date, FRONTMATTER_DATE_FORMAT);
    this.intervals.add({
      startDate,
      endDate,
      index: frontmatter.index,
      path,
    });
  }

  clearForPath(path: string): void {
    this.intervals.clearForPath(path);
  }

  supportsCommand(id: string): boolean {
    return id in intervalCommands;
  }

  async execCommand(id: string): Promise<void> {
    switch (id) {
      case "interval-journal:open": {
        await this.open();
        break;
      }
      case "interval-journal:open-next": {
        await this.openNext();
        break;
      }
      case "interval-journal:open-prev": {
        await this.openPrev();
        break;
      }
    }
  }

  private getNoteName(interval: Interval): string {
    const templateContext = this.getTemplateContext(interval);
    return replaceTemplateVariables(this.config.titleTemplate, templateContext);
  }

  private getIntervalPath(interval: Interval): string {
    if (interval.path) return interval.path;
    const templateContext = this.getTemplateContext(interval);
    const filename = replaceTemplateVariables(this.config.titleTemplate, templateContext) + ".md";
    const folderPath = replaceTemplateVariables(this.config.folder, templateContext);
    return folderPath ? `${folderPath}/${filename}` : filename;
  }

  private async ensureIntervalNote(interval: Interval): Promise<TFile> {
    const filePath = this.getIntervalPath(interval);
    let file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file) {
      await ensureFolderExists(this.app, filePath);
      file = await this.app.vault.create(
        filePath,
        await this.getContent(this.getTemplateContext(interval, this.getNoteName(interval))),
      );
      await this.processFrontMatter(file as TFile, interval);
    } else {
      await this.enshureFrontMatter(file as TFile, interval);
    }
    return file as TFile;
  }

  private async enshureFrontMatter(file: TFile, interval: Interval): Promise<void> {
    const metadata = this.app.metadataCache.getFileCache(file);
    if (
      !metadata?.frontmatter?.[FRONTMATTER_ID_KEY] ||
      metadata.frontmatter[FRONTMATTER_ID_KEY] ||
      metadata.frontmatter[FRONTMATTER_START_DATE_KEY] ||
      metadata.frontmatter[FRONTMATTER_END_DATE_KEY] ||
      metadata.frontmatter[FRONTMATTER_INDEX_KEY]
    ) {
      await this.processFrontMatter(file, interval);
    }
  }

  private processFrontMatter(file: TFile, interval: Interval): Promise<void> {
    return new Promise((resolve) => {
      this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        frontmatter[FRONTMATTER_ID_KEY] = this.id;
        frontmatter[FRONTMATTER_START_DATE_KEY] = interval.startDate.format(FRONTMATTER_DATE_FORMAT);
        frontmatter[FRONTMATTER_END_DATE_KEY] = interval.endDate.format(FRONTMATTER_DATE_FORMAT);
        frontmatter[FRONTMATTER_INDEX_KEY] = interval.index;
        resolve();
      });
      this.intervals.add({ ...interval, path: file.path });
    });
  }

  private async openInterval(interval: Interval): Promise<void> {
    const file = await this.ensureIntervalNote(interval);
    const mode = this.config.openMode === "active" ? undefined : this.config.openMode;
    const leaf = this.app.workspace.getLeaf(mode);
    await leaf.openFile(file, { active: true });
  }

  getTemplateContext(interval: Interval, note_name?: string): TemplateContext {
    return {
      start_date: {
        value: interval.startDate,
        defaultFormat: this.config.dateFormat,
      },
      end_date: {
        value: interval.endDate,
        defaultFormat: this.config.dateFormat,
      },
      index: {
        value: interval.index,
      },
      journal_name: {
        value: this.config.name,
      },
      note_name: {
        value: note_name ?? "",
      },
    };
  }

  private async getContent(context: TemplateContext): Promise<string> {
    if (this.config.template) {
      const path = replaceTemplateVariables(
        this.config.template.endsWith(".md") ? this.config.template : this.config.template + ".md",
        context,
      );
      const templateFile = this.app.vault.getAbstractFileByPath(path);
      if (templateFile instanceof TFile) {
        const templateContent = await this.app.vault.cachedRead(templateFile);
        return replaceTemplateVariables(templateContent, context);
      }
    }
    return "";
  }

  async clearNotes(): Promise<void> {
    const proomises = [];
    for (const entry of this.intervals) {
      if (!entry.path) continue;
      const file = this.app.vault.getAbstractFileByPath(entry.path);
      if (!file) continue;
      proomises.push(
        new Promise<void>((resolve) => {
          this.app.fileManager.processFrontMatter(file as TFile, (frontmatter) => {
            delete frontmatter[FRONTMATTER_ID_KEY];
            delete frontmatter[FRONTMATTER_START_DATE_KEY];
            delete frontmatter[FRONTMATTER_END_DATE_KEY];
            delete frontmatter[FRONTMATTER_INDEX_KEY];
            resolve();
          });
        }),
      );
    }
    await Promise.allSettled(proomises);
  }

  async deleteNotes(): Promise<void> {
    const proomises = [];
    for (const entry of this.intervals) {
      if (!entry.path) continue;
      const file = this.app.vault.getAbstractFileByPath(entry.path);
      if (!file) continue;
      proomises.push(this.app.vault.delete(file));
    }
    await Promise.allSettled(proomises);
  }
}
