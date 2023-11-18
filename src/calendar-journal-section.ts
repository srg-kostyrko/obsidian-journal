import { App, TFile, moment } from "obsidian";
import { CalendarGranularity, CalndarSectionBase } from "./contracts/config.types";
import { CalendarJournal } from "./calendar-journal";
import { ensureFolderExists } from "./utils/io";
import { replaceTemplateVariables } from "./utils/template";
import { TemplateContext } from "./contracts/template.types";
import { FRONTMATTER_DATE_FORMAT } from "./constants";

export class CalendarJournalSection<T extends CalndarSectionBase> {
  constructor(
    private app: App,
    private journal: CalendarJournal,
    private config: T,
    private granularity: CalendarGranularity,
  ) {}

  get folderPath(): string {
    const folderPath = [this.journal.config.rootFolder];
    if (this.config.folder) {
      folderPath.push(this.config.folder);
    }
    return folderPath.join("/").replaceAll(/\/{2,}/g, "/");
  }

  async open(): Promise<void> {
    const date = moment().startOf(this.granularity);
    const templateContext: TemplateContext = {
      date: {
        value: date,
        defaultFormat: this.config.dateFormat,
      },
    };
    const filename = replaceTemplateVariables(this.config.titleTemplate, templateContext) + ".md";
    const folderPath = replaceTemplateVariables(this.folderPath, templateContext);
    const filePath = folderPath ? `${folderPath}/${filename}` : filename;
    let file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file) {
      await ensureFolderExists(this.app, folderPath);
      file = await this.app.vault.create(filePath, await this.getContent(templateContext));
      this.app.fileManager.processFrontMatter(file as TFile, (frontmatter) => {
        console.log(frontmatter);
        frontmatter["date"] = date.format(FRONTMATTER_DATE_FORMAT);
        frontmatter["journal"] = [this.journal.id, this.granularity];
      });
    }
    const leaf = this.app.workspace.getLeaf();
    await leaf.openFile(file as TFile, { active: true });
  }

  async getContent(context: TemplateContext): Promise<string> {
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
