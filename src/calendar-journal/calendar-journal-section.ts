import { App, TFile, Plugin, normalizePath } from "obsidian";
import { CalendarGranularity, CalendarSection } from "../contracts/config.types";
import { CalendarJournal } from "./calendar-journal";
import { ensureFolderExists } from "../utils/io";
import { replaceTemplateVariables } from "../utils/template";
import { TemplateContext } from "../contracts/template.types";
import {
  FRONTMATTER_ADDING_DELAY,
  FRONTMATTER_DATE_FORMAT,
  FRONTMATTER_END_DATE_KEY,
  FRONTMATTER_ID_KEY,
  FRONTMATTER_SECTION_KEY,
  FRONTMATTER_START_DATE_KEY,
} from "../constants";
import { MomentDate } from "../contracts/date.types";
import { CalendarHelper } from "../utils/calendar";
import {
  DEFAULT_DATE_FORMATS_CALENDAR,
  DEFAULT_NAME_TEMPLATE_CALENDAR,
  DEFAULT_RIBBON_ICONS_CALENDAR,
  DEFAULT_RIBBON_TOOLTIPS,
} from "../config/config-defaults";
import { delay } from "../utils/misc";

export class CalendarJournalSection {
  constructor(
    protected app: App,
    protected journal: CalendarJournal,
    protected config: CalendarSection,
    protected granularity: CalendarGranularity,
    protected calendar: CalendarHelper,
  ) {}

  get folderPath(): string {
    const folderPath = this.journal.config.rootFolder ? [this.journal.config.rootFolder] : [];
    if (this.config.folder) {
      folderPath.push(this.config.folder);
    }
    return folderPath.join("/").replaceAll(/\/{2,}/g, "/");
  }

  get nameTemplate(): string {
    return this.config.nameTemplate || DEFAULT_NAME_TEMPLATE_CALENDAR;
  }

  get dateFormat(): string {
    return this.config.dateFormat || DEFAULT_DATE_FORMATS_CALENDAR[this.granularity];
  }

  get ribbonIcon(): string {
    return this.config.ribbon.icon || DEFAULT_RIBBON_ICONS_CALENDAR;
  }

  get ribbonTooltip(): string {
    return this.config.ribbon.tooltip || DEFAULT_RIBBON_TOOLTIPS[this.granularity];
  }

  getRangeStart(date?: string): MomentDate {
    return this.calendar.date(date).startOf(this.granularity);
  }

  getRangeEnd(date?: string): MomentDate {
    return this.calendar.date(date).endOf(this.granularity);
  }

  async autoCreateNote(): Promise<void> {
    if (!this.config.enabled) return;
    if (!this.config.createOnStartup) return;
    await this.ensureDateNote(this.getRangeStart(), this.getRangeEnd());
  }

  configureRibbonIcons(plugin: Plugin): void {
    if (!this.config.enabled) return;
    if (!this.config.ribbon.show) return;
    plugin.addRibbonIcon(this.ribbonIcon, this.ribbonTooltip, () => {
      this.open();
    });
  }

  async open(date?: string): Promise<void> {
    return await this.openDate(this.getRangeStart(date), this.getRangeEnd(date));
  }

  async openPath(filePath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file) return;
    if (!(file instanceof TFile)) return;
    await this.openFile(file);
  }

  async openNext(date?: string): Promise<void> {
    const startDate = this.getRangeStart(date).add(1, this.granularity);
    const endDate = startDate.clone().endOf(this.granularity);
    return await this.openDate(startDate, endDate);
  }

  async openPrev(date?: string): Promise<void> {
    const startDate = this.getRangeStart(date).subtract(1, this.granularity);
    const endDate = startDate.clone().endOf(this.granularity);
    return await this.openDate(startDate, endDate);
  }

  getDateFilename(startDate: MomentDate, endDate: MomentDate): string {
    const templateContext = this.getTemplateContext(startDate, endDate);
    return replaceTemplateVariables(this.nameTemplate, templateContext) + ".md";
  }

  getDateFolder(startDate: MomentDate, endDate: MomentDate): string {
    const templateContext = this.getTemplateContext(startDate, endDate);
    return replaceTemplateVariables(this.folderPath, templateContext);
  }

  async connectNote(
    file: TFile,
    startDate: MomentDate,
    endDate: MomentDate,
    options: {
      override?: boolean;
      rename?: boolean;
      move?: boolean;
    },
  ): Promise<void> {
    const indexed = this.journal.index.get(startDate, this.granularity);
    if (indexed) {
      if (!options.override) return;
      await this.journal.disconnectNote(indexed.path);
    }
    let path = file.path;
    if (options.rename || options.move) {
      const folderPath = options.move ? this.getDateFolder(startDate, endDate) : file.parent?.path;
      const filename = options.rename ? this.getDateFilename(startDate, endDate) : file.name;
      path = normalizePath(folderPath ? `${folderPath}/${filename}` : filename);
      await ensureFolderExists(this.app, path);
      await this.app.vault.rename(file, path);
      file = this.app.vault.getAbstractFileByPath(path) as TFile;
    }

    this.journal.index.add(startDate, endDate, {
      path: path,
      granularity: this.granularity,
      startDate: startDate.format(FRONTMATTER_DATE_FORMAT),
      endDate: endDate.format(FRONTMATTER_DATE_FORMAT),
    });
    await this.ensureFrontMatter(file, startDate, startDate);
  }

  private async ensureDateNote(startDate: MomentDate, endDate: MomentDate): Promise<TFile> {
    const filePath = this.getDatePath(startDate, endDate);
    let file = this.app.vault.getAbstractFileByPath(filePath);

    if (!file) {
      await ensureFolderExists(this.app, filePath);
      file = await this.app.vault.create(
        filePath,
        await this.getContent(this.getTemplateContext(startDate, endDate, this.getNoteName(startDate, endDate))),
      );
      if (!(file instanceof TFile)) throw new Error("File is not a TFile");
      await delay(FRONTMATTER_ADDING_DELAY);
      await this.processFrontMatter(file, startDate, endDate);
    } else {
      if (!(file instanceof TFile)) throw new Error("File is not a TFile");
      await this.ensureFrontMatter(file, startDate, endDate);
    }
    return file;
  }

  private async openDate(startDate: MomentDate, endDate: MomentDate): Promise<void> {
    const file = await this.ensureDateNote(startDate, endDate);
    await this.openFile(file);
  }

  private async openFile(file: TFile): Promise<void> {
    const mode = this.config.openMode === "active" ? undefined : this.config.openMode;
    const leaf = this.app.workspace.getLeaf(mode);
    await leaf.openFile(file, { active: true });
  }

  private getTemplateContext(start_date: MomentDate, end_date: MomentDate, note_name?: string): TemplateContext {
    return {
      date: {
        value: start_date,
        defaultFormat: this.dateFormat,
      },
      start_date: {
        value: start_date,
        defaultFormat: this.dateFormat,
      },
      end_date: {
        value: end_date,
        defaultFormat: this.dateFormat,
      },
      journal_name: {
        value: this.journal.name,
      },
      note_name: {
        value: note_name ?? "",
      },
    };
  }

  private getNoteName(startDate: MomentDate, endDate: MomentDate): string {
    const templateContext = this.getTemplateContext(startDate, endDate);
    return replaceTemplateVariables(this.nameTemplate, templateContext);
  }

  private getDatePath(startDate: MomentDate, endDate: MomentDate): string {
    const indexed = this.journal.index.get(startDate, this.granularity);
    if (indexed) return indexed.path;
    const templateContext = this.getTemplateContext(startDate, endDate);
    const filename = replaceTemplateVariables(this.nameTemplate, templateContext) + ".md";
    const folderPath = replaceTemplateVariables(this.folderPath, templateContext);
    return normalizePath(folderPath ? `${folderPath}/${filename}` : filename);
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

  private async ensureFrontMatter(file: TFile, startDate: MomentDate, endDate: MomentDate): Promise<void> {
    const metadata = this.app.metadataCache.getFileCache(file);
    if (
      !metadata?.frontmatter?.[FRONTMATTER_ID_KEY] ||
      metadata?.frontmatter?.[FRONTMATTER_ID_KEY] ||
      metadata?.frontmatter?.[FRONTMATTER_START_DATE_KEY] ||
      metadata?.frontmatter?.[FRONTMATTER_END_DATE_KEY] ||
      metadata?.frontmatter?.[FRONTMATTER_SECTION_KEY]
    ) {
      await this.processFrontMatter(file, startDate, endDate);
    }
  }

  private async processFrontMatter(file: TFile, startDate: MomentDate, endDate: MomentDate): Promise<void> {
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      frontmatter[FRONTMATTER_ID_KEY] = this.journal.id;
      frontmatter[FRONTMATTER_START_DATE_KEY] = startDate.format(FRONTMATTER_DATE_FORMAT);
      frontmatter[FRONTMATTER_END_DATE_KEY] = endDate.format(FRONTMATTER_DATE_FORMAT);
      frontmatter[FRONTMATTER_SECTION_KEY] = this.granularity;
    });
    this.journal.index.add(startDate, endDate, {
      path: file.path,
      granularity: this.granularity,
      startDate: startDate.format(FRONTMATTER_DATE_FORMAT),
      endDate: endDate.format(FRONTMATTER_DATE_FORMAT),
    });
  }
}
