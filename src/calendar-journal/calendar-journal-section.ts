import { App, TFile, Plugin } from "obsidian";
import { CalendarGranularity, CalendarSection } from "../contracts/config.types";
import { CalendarJournal } from "./calendar-journal";
import { ensureFolderExists } from "../utils/io";
import { replaceTemplateVariables } from "../utils/template";
import { TemplateContext } from "../contracts/template.types";
import {
  FRONTMATTER_DATE_FORMAT,
  FRONTMATTER_END_DATE_KEY,
  FRONTMATTER_ID_KEY,
  FRONTMATTER_SECTION_KEY,
  FRONTMATTER_START_DATE_KEY,
  SECTIONS_MAP,
} from "../constants";
import { MomentDate } from "../contracts/date.types";
import { CalendarHelper } from "../utils/calendar";

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
    plugin.addRibbonIcon(
      this.config.ribbon.icon || "calendar-days",
      this.config.ribbon.tooltip || `Open ${SECTIONS_MAP[this.granularity]} Note`,
      () => {
        this.open();
      },
    );
  }

  async open(date?: string): Promise<void> {
    return await this.openDate(this.getRangeStart(date), this.getRangeEnd(date));
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

  private async ensureDateNote(startDate: MomentDate, endDate: MomentDate): Promise<TFile> {
    const filePath = this.getDatePath(startDate, endDate);
    let file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file) {
      await ensureFolderExists(this.app, filePath);
      file = await this.app.vault.create(
        filePath,
        await this.getContent(this.getTemplateContext(startDate, endDate, this.getNoteName(startDate, endDate))),
      );
      await this.processFrontMatter(file as TFile, startDate, endDate);
    } else {
      await this.enshureFrontMatter(file as TFile, startDate, endDate);
    }
    return file as TFile;
  }

  private async openDate(startDate: MomentDate, endDate: MomentDate): Promise<void> {
    const file = await this.ensureDateNote(startDate, endDate);
    const mode = this.config.openMode === "active" ? undefined : this.config.openMode;
    const leaf = this.app.workspace.getLeaf(mode);
    await leaf.openFile(file, { active: true });
  }

  private getTemplateContext(start_date: MomentDate, end_date: MomentDate, note_name?: string): TemplateContext {
    return {
      date: {
        value: start_date,
        defaultFormat: this.config.dateFormat,
      },
      start_date: {
        value: start_date,
        defaultFormat: this.config.dateFormat,
      },
      end_date: {
        value: end_date,
        defaultFormat: this.config.dateFormat,
      },
      journal_name: {
        value: this.journal.config.name,
      },
      note_name: {
        value: note_name ?? "",
      },
    };
  }

  private getNoteName(startDate: MomentDate, endDate: MomentDate): string {
    const templateContext = this.getTemplateContext(startDate, endDate);
    return replaceTemplateVariables(this.config.nameTemplate, templateContext);
  }

  private getDatePath(startDate: MomentDate, endDate: MomentDate): string {
    const indexed = this.journal.index.get(startDate, this.granularity);
    if (indexed) return indexed.path;
    const templateContext = this.getTemplateContext(startDate, endDate);
    const filename = replaceTemplateVariables(this.config.nameTemplate, templateContext) + ".md";
    const folderPath = replaceTemplateVariables(this.folderPath, templateContext);
    return folderPath ? `${folderPath}/${filename}` : filename;
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

  private async enshureFrontMatter(file: TFile, startDate: MomentDate, endDate: MomentDate): Promise<void> {
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

  private processFrontMatter(file: TFile, startDate: MomentDate, endDate: MomentDate): Promise<void> {
    return new Promise((resolve) => {
      this.app.fileManager.processFrontMatter(file as TFile, (frontmatter) => {
        frontmatter[FRONTMATTER_ID_KEY] = this.journal.id;
        frontmatter[FRONTMATTER_START_DATE_KEY] = startDate.format(FRONTMATTER_DATE_FORMAT);
        frontmatter[FRONTMATTER_END_DATE_KEY] = endDate.format(FRONTMATTER_DATE_FORMAT);
        frontmatter[FRONTMATTER_SECTION_KEY] = this.granularity;
        resolve();
      });
      this.journal.index.add(startDate, endDate, { path: file.path, granularity: this.granularity });
    });
  }
}
