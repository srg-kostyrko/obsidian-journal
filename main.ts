import { Plugin } from "obsidian";
import { JournalSettingTab } from "./src/settings/journal-settings";
import { JournalConfig } from "./src/config/journal-config";
import { CalendarJournal } from "./src/calendar-journal";
import { CalendarConfig } from "./src/contracts/config.types";

export default class JournalPlugin extends Plugin {
  private config: JournalConfig;
  async onload() {
    const appStartup = document.body.querySelector(".progress-bar") !== null;

    this.config = new JournalConfig(this);
    await this.config.load();

    this.addSettingTab(new JournalSettingTab(this.app, this, this.config));

    const calendar = new CalendarJournal(this.app, this.config.get(0) as CalendarConfig);

    this.addRibbonIcon("calendar-days", "Open daily note", async () => {
      await calendar.daily.open();
    });

    this.app.workspace.onLayoutReady(async () => {
      if (appStartup) await calendar.openStartupNote();
    });
  }
}
