import { type App, type FrontMatterCache, Plugin, TFile, normalizePath, moment } from "obsidian";
import type { IntervalConfig, IntervalFrontMatter, JournalFrontMatter } from "../contracts/config.types";
import { CalendarHelper } from "../utils/calendar";
import type { Journal } from "../contracts/journal.types";
import {
  FRONTMATTER_DATE_FORMAT,
  FRONTMATTER_END_DATE_KEY,
  FRONTMATTER_ID_KEY,
  FRONTMATTER_INDEX_KEY,
  FRONTMATTER_START_DATE_KEY,
} from "../constants";
import { TemplateContext } from "../contracts/template.types";
import { replaceTemplateVariables, tryApplyingTemplater, tryTemplaterCursorJump } from "../utils/template";
import { ensureFolderExists } from "../utils/io";
import { type Interval, IntervalManager } from "./interval-manager";
import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_NAME_TEMPLATE_INTERVAL,
  DEFAULT_NAV_DATES_TEMPLATE_INTERVAL,
  DEFAULT_RIBBON_ICONS_INTERVAL,
} from "../config/config-defaults";
import type { MomentDate } from "../contracts/date.types";

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
    public readonly calendar: CalendarHelper,
  ) {
    this.intervals = new IntervalManager(this.config, this.calendar);
  }

  get id(): string {
    return this.config.id;
  }

  readonly type = "interval";

  get name(): string {
    return this.config.name;
  }

  get nameTemplate(): string {
    return this.config.nameTemplate || DEFAULT_NAME_TEMPLATE_INTERVAL;
  }

  get navNameTemplate(): string {
    return this.config.navNameTemplate || this.nameTemplate;
  }

  get navDatesTemplate(): string {
    return this.config.navDatesTemplate || DEFAULT_NAV_DATES_TEMPLATE_INTERVAL;
  }

  get dateFormat(): string {
    return this.config.dateFormat || DEFAULT_DATE_FORMAT;
  }

  get ribbonIcon(): string {
    return this.config.ribbon.icon || DEFAULT_RIBBON_ICONS_INTERVAL;
  }

  get ribbonTooltip(): string {
    return this.config.ribbon.tooltip || `Open current ${this.config.name} note`;
  }

  get endDate(): string {
    switch (this.config.end_type) {
      case "date":
        return this.config.end_date;
      case "repeats":
        return this.calendar
          .date(this.config.start_date)
          .add(this.config.repeats * this.config.duration, this.config.granularity)
          .format("YYYY-MM-DD");
    }
    return "";
  }

  async findNextNote(data: IntervalFrontMatter): Promise<string | null> {
    return this.intervals.findNextNote(this.calendar.date(data.end_date).add(1, "day").startOf("day"));
  }
  async findPreviousNote(data: IntervalFrontMatter): Promise<string | null> {
    return this.intervals.findPreviousNote(this.calendar.date(data.start_date).subtract(1, "day").endOf("day"));
  }

  async openPath(path: string, _frontmatter: JournalFrontMatter): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) return;
    if (!(file instanceof TFile)) return;
    await this.openFile(file, false);
  }

  findInterval(date?: string): Interval | null {
    return this.intervals.findInterval(date);
  }
  findNextInterval(date?: string): Interval | null {
    return this.intervals.findNextInterval(date);
  }

  findPreviousInterval(date?: string): Interval | null {
    return this.intervals.findPreviousInterval(date);
  }

  findIntervalsForPeriod(startDate: MomentDate, endDate: MomentDate): Interval[] {
    const list: Interval[] = [];
    if (this.config.limitCreation && startDate.isBefore(this.calendar.date(this.config.start_date))) {
      startDate = this.calendar.date(this.config.start_date);
    }
    let interval = this.intervals.findInterval(startDate.format("YYYY-MM-DD"));
    if (!interval) return list;
    do {
      list.push(interval);
      interval = this.intervals.findNextInterval(interval.endDate.format("YYYY-MM-DD"));
    } while (interval && interval.startDate.isBefore(endDate));
    return list;
  }

  getIntervalFileName(interval: Interval): string {
    return replaceTemplateVariables(this.nameTemplate, this.getTemplateContext(interval));
  }

  getIntervalFolderPath(interval: Interval): string {
    return normalizePath(replaceTemplateVariables(this.config.folder, this.getTemplateContext(interval)));
  }

  async open(date?: string): Promise<void> {
    const interval = this.findInterval(date);
    if (!interval) return;
    return await this.openInterval(interval);
  }

  async openNext(date?: string): Promise<void> {
    const interval = this.intervals.findNextInterval(date);
    if (!interval) return;
    return await this.openInterval(interval);
  }

  async openPrev(date?: string): Promise<void> {
    const interval = this.intervals.findPreviousInterval(date);
    if (!interval) return;
    return await this.openInterval(interval);
  }

  async autoCreateNotes(): Promise<void> {
    if (!this.config.createOnStartup) return;
    const interval = this.findInterval();
    if (!interval) return;
    await this.ensureIntervalNote(interval);
  }

  async openStartupNote(): Promise<void> {
    if (!this.config.openOnStartup) return;
    this.open();
  }

  configureRibbonIcons(plugin: Plugin): void {
    if (!this.config.ribbon.show) return;
    plugin.addRibbonIcon(this.ribbonIcon, this.ribbonTooltip, () => {
      this.open();
    });
  }

  parseFrontMatter(frontmatter: FrontMatterCache): IntervalFrontMatter | null {
    const start_date = frontmatter[FRONTMATTER_START_DATE_KEY];
    const end_date = frontmatter[FRONTMATTER_END_DATE_KEY];
    if (!moment(start_date).isValid() || !moment(end_date).isValid()) {
      return null;
    }

    return {
      type: "interval",
      id: this.id,
      start_date,
      end_date,
      index: frontmatter[FRONTMATTER_INDEX_KEY],
    };
  }

  indexNote(frontmatter: IntervalFrontMatter, path: string): void {
    const startDate = this.calendar.date(frontmatter.start_date, FRONTMATTER_DATE_FORMAT);
    const endDate = this.calendar.date(frontmatter.end_date, FRONTMATTER_DATE_FORMAT).endOf("day");
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

  async connectNote(
    file: TFile,
    interval: Interval,
    options: {
      override?: boolean;
      rename?: boolean;
      move?: boolean;
    },
  ): Promise<void> {
    if (interval.path) {
      if (!options.override) return;
      await this.disconnectNote(interval.path);
    }
    let path = file.path;
    if (options.rename || options.move) {
      const folderPath = options.move ? this.getIntervalFolderPath(interval) : file.parent?.path;
      const filename = options.rename ? this.getIntervalFileName(interval) + ".md" : file.name;
      path = normalizePath(folderPath ? `${folderPath}/${filename}` : filename);
      await ensureFolderExists(this.app, path);
      await this.app.vault.rename(file, path);
      file = this.app.vault.getAbstractFileByPath(path) as TFile;
    }
    interval.path = path;
    this.intervals.add(interval);
    await this.ensureFrontMatter(file, interval);
  }

  disconnectNote(path: string): Promise<void> {
    this.intervals.clearForPath(path);
    return this.clearFrontMatter(path);
  }

  private getNoteName(interval: Interval): string {
    const templateContext = this.getTemplateContext(interval);
    return replaceTemplateVariables(this.nameTemplate, templateContext);
  }

  private getIntervalPath(interval: Interval): string {
    if (interval.path) return interval.path;
    const templateContext = this.getTemplateContext(interval);
    const filename = replaceTemplateVariables(this.nameTemplate, templateContext) + ".md";
    const folderPath = replaceTemplateVariables(this.config.folder, templateContext);
    return normalizePath(folderPath ? `${folderPath}/${filename}` : filename);
  }

  private async ensureIntervalNote(interval: Interval): Promise<[TFile, boolean]> {
    const filePath = this.getIntervalPath(interval);
    let file = this.app.vault.getAbstractFileByPath(filePath);
    let newFile = false;
    if (!file) {
      newFile = true;
      await ensureFolderExists(this.app, filePath);
      file = await this.app.vault.create(filePath, "");
      if (!(file instanceof TFile)) throw new Error("File is not a TFile");
      const content = await this.getContent(file, this.getTemplateContext(interval, this.getNoteName(interval)));
      if (content) await this.app.vault.modify(file, content);
      await this.processFrontMatter(file, interval);
    } else {
      if (!(file instanceof TFile)) throw new Error("File is not a TFile");
      await this.ensureFrontMatter(file, interval);
    }
    return [file, newFile];
  }

  private async ensureFrontMatter(file: TFile, interval: Interval): Promise<void> {
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

  private async processFrontMatter(file: TFile, interval: Interval): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter[FRONTMATTER_ID_KEY] = this.id;
      frontmatter[FRONTMATTER_START_DATE_KEY] = interval.startDate.format(FRONTMATTER_DATE_FORMAT);
      frontmatter[FRONTMATTER_END_DATE_KEY] = interval.endDate.format(FRONTMATTER_DATE_FORMAT);
      frontmatter[FRONTMATTER_INDEX_KEY] = interval.index;
    });
    this.intervals.add({ ...interval, path: file.path });
  }

  private async clearFrontMatter(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) return;
    if (!(file instanceof TFile)) return;
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      delete frontmatter[FRONTMATTER_ID_KEY];
      delete frontmatter[FRONTMATTER_START_DATE_KEY];
      delete frontmatter[FRONTMATTER_END_DATE_KEY];
      delete frontmatter[FRONTMATTER_INDEX_KEY];
    });
  }

  private async openInterval(interval: Interval): Promise<void> {
    const [file, isNew] = await this.ensureIntervalNote(interval);
    await this.openFile(file, isNew);
  }

  private async openFile(file: TFile, isNew: boolean): Promise<void> {
    const mode = this.config.openMode === "active" ? undefined : this.config.openMode;
    const leaf = this.app.workspace.getLeaf(mode);
    await leaf.openFile(file, { active: true });
    if (isNew) {
      await tryTemplaterCursorJump(this.app, file);
    }
  }

  getTemplateContext(interval: Interval, note_name?: string): TemplateContext {
    return {
      date: {
        value: interval.startDate,
        defaultFormat: this.dateFormat,
      },
      start_date: {
        value: interval.startDate,
        defaultFormat: this.dateFormat,
      },
      end_date: {
        value: interval.endDate,
        defaultFormat: this.dateFormat,
      },
      index: {
        value: interval.index,
      },
      journal_name: {
        value: this.name,
      },
      note_name: {
        value: note_name ?? "",
      },
    };
  }

  private async getContent(note: TFile, context: TemplateContext): Promise<string> {
    if (this.config.template) {
      const path = replaceTemplateVariables(
        this.config.template.endsWith(".md") ? this.config.template : this.config.template + ".md",
        context,
      );
      const templateFile = this.app.vault.getAbstractFileByPath(path);
      if (templateFile instanceof TFile) {
        const templateContent = await this.app.vault.cachedRead(templateFile);
        return tryApplyingTemplater(this.app, templateFile, note, replaceTemplateVariables(templateContent, context));
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
      if (!(file instanceof TFile)) continue;
      proomises.push(
        new Promise<void>((resolve) => {
          this.app.fileManager.processFrontMatter(file, (frontmatter) => {
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
