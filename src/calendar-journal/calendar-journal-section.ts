import { App, TFile, moment } from "obsidian";
import { CalendarGranularity, CalndarSectionBase } from "../contracts/config.types";
import { CalendarJournal } from "./calendar-journal";
import { ensureFolderExists } from "../utils/io";
import { replaceTemplateVariables } from "../utils/template";
import { TemplateContext } from "../contracts/template.types";
import { FRONTMATTER_DATE_FORMAT, FRONTMATTER_DATE_KEY, FRONTMATTER_ID_KEY, FRONTMATTER_META_KEY } from "../constants";
import { CalendarJournalSectionIndex } from "./calendar-journal-section-index";
import { MomentDate } from "../contracts/date.types";

export class CalendarJournalSection<T extends CalndarSectionBase> {
  private index = new CalendarJournalSectionIndex();

  constructor(
    private app: App,
    private journal: CalendarJournal,
    private config: T,
    private granularity: CalendarGranularity,
  ) {}

  get folderPath(): string {
    const folderPath = this.journal.config.rootFolder ? [this.journal.config.rootFolder] : [];
    if (this.config.folder) {
      folderPath.push(this.config.folder);
    }
    return folderPath.join("/").replaceAll(/\/{2,}/g, "/");
  }

  indexNote(date: MomentDate, path: string) {
    this.index.set(date, { path });
  }
  clearForPath(path: string): void {
    this.index.clearForPath(path);
  }

  async open(): Promise<void> {
    const date = moment().startOf(this.granularity);
    return await this.openDate(date);
  }

  async openNext(): Promise<void> {
    const date = moment().startOf(this.granularity).add(1, this.granularity);
    return await this.openDate(date);
  }

  async openPrev(): Promise<void> {
    const date = moment().startOf(this.granularity).subtract(1, this.granularity);
    return await this.openDate(date);
  }

  private async openDate(date: MomentDate): Promise<void> {
    const filePath = this.getDatePath(date);
    let file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file) {
      await ensureFolderExists(this.app, filePath);
      file = await this.app.vault.create(filePath, await this.getContent(this.getTemplateContext(date)));
      this.app.fileManager.processFrontMatter(file as TFile, (frontmatter) => {
        frontmatter[FRONTMATTER_ID_KEY] = this.journal.id;
        frontmatter[FRONTMATTER_DATE_KEY] = date.format(FRONTMATTER_DATE_FORMAT);
        frontmatter[FRONTMATTER_META_KEY] = [this.granularity];
      });
      this.index.set(date, {
        path: filePath,
      });
    }
    const leaf = this.app.workspace.getLeaf();
    await leaf.openFile(file as TFile, { active: true });
  }

  private getTemplateContext(date: MomentDate): TemplateContext {
    return {
      date: {
        value: date,
        defaultFormat: this.config.dateFormat,
      },
    };
  }

  private getDatePath(date: MomentDate): string {
    const indexed = this.index.get(date);
    if (indexed) return indexed.path;
    const templateContext = this.getTemplateContext(date);
    const filename = replaceTemplateVariables(this.config.titleTemplate, templateContext) + ".md";
    const folderPath = replaceTemplateVariables(this.folderPath, templateContext);
    return folderPath ? `${folderPath}/${filename}` : filename;
  }

  private async getContent(context: TemplateContext): Promise<string> {
    if (this.config.template) {
      const templateFile = this.app.vault.getAbstractFileByPath(
        this.config.template.endsWith(".md") ? this.config.template : this.config.template + ".md",
      );
      if (templateFile instanceof TFile) {
        const templateContent = await this.app.vault.cachedRead(templateFile);
        return replaceTemplateVariables(templateContent, context);
      }
    }
    return "";
  }
}
