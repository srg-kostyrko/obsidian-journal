import { App, TFile, moment } from "obsidian";
import { CalendarGranularity, CalndarSectionBase } from "./contracts/config.types";
import { CalendarJournal } from "./calendar-journal";
import { ensureFolderExists } from "./utils/io";

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
    const formattedDate = date.format(this.config.dateFormat);
    const filename = this.config.titleTemplate.replaceAll("{{date}}", formattedDate) + ".md";
    const folderPath = this.folderPath;
    const filePath = folderPath ? `${folderPath}/${filename}` : filename;
    let file = this.app.vault.getAbstractFileByPath(filePath);
    if (!file) {
      await ensureFolderExists(this.app, folderPath);
      file = await this.app.vault.create(filePath, await this.getContent());
    }
    const leaf = this.app.workspace.getLeaf();
    await leaf.openFile(file as TFile, { active: true });
  }

  async getContent(): Promise<string> {
    return "";
  }
}
