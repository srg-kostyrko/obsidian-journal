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

  findInterval(date?: string): Interval {
    return this.intervals.findInterval(date);
  }

  async open(date?: string): Promise<void> {
    return await this.openInterval(this.findInterval(date));
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
      file = await this.app.vault.create(filePath, await this.getContent(this.getTemplateContext(interval)));
      this.app.fileManager.processFrontMatter(file as TFile, (frontmatter) => {
        frontmatter[FRONTMATTER_ID_KEY] = this.id;
        frontmatter[FRONTMATTER_START_DATE_KEY] = interval.startDate.format(FRONTMATTER_DATE_FORMAT);
        frontmatter[FRONTMATTER_END_DATE_KEY] = interval.endDate.format(FRONTMATTER_DATE_FORMAT);
        frontmatter[FRONTMATTER_INDEX_KEY] = interval.index;
      });
      this.intervals.add({ ...interval, path: filePath });
    }
    return file as TFile;
  }

  private async openInterval(interval: Interval): Promise<void> {
    const file = await this.ensureIntervalNote(interval);
    const mode = this.config.openMode === "active" ? undefined : this.config.openMode;
    const leaf = this.app.workspace.getLeaf(mode);
    await leaf.openFile(file, { active: true });
  }

  private getTemplateContext(interval: Interval): TemplateContext {
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
}
