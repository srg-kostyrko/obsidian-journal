import { Plugin } from "obsidian";
import { JournalSettingTab } from "./src/settings/journal-settings";
import { JournalConfig } from "./src/config/journal-config";
import { JournalManager } from "./src/journal-manager";

export default class JournalPlugin extends Plugin {
  private config: JournalConfig;
  private manager: JournalManager;
  async onload() {
    const appStartup = document.body.querySelector(".progress-bar") !== null;

    this.config = new JournalConfig(this);
    await this.config.load();
    this.manager = new JournalManager(this.app, this.config);
    this.addChild(this.manager);

    this.addSettingTab(new JournalSettingTab(this.app, this, this.config));

    this.addRibbonIcon("calendar-days", "Open daily note", async () => {
      await this.manager.defaultJournal?.daily.open();
    });

    this.app.workspace.onLayoutReady(async () => {
      await this.manager.reindex();
      if (appStartup) await this.manager.openStartupNote();
    });
  }
}
