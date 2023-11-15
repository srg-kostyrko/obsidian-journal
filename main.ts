import { Plugin, TFile, moment } from "obsidian";
import { JournalSettingTab } from "./src/journal-settings";

const NAME_FORMAT = "YYYY-MM-DD";

export default class JournalPlugin extends Plugin {
  async onload() {
    this.addSettingTab(new JournalSettingTab(this.app, this));

    this.addRibbonIcon("calendar-days", "Open daily note", async () => {
      const filename = moment().format(NAME_FORMAT) + ".md";
      let file = this.app.vault.getAbstractFileByPath(filename);
      if (!file) {
        file = await this.app.vault.create(filename, "");
      }
      const leaf = this.app.workspace.getLeaf();
      await leaf.openFile(file as TFile, { active: true });
    });
  }
}
