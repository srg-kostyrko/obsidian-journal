import { PluginSettingTab, Plugin, type App } from "obsidian";
import { SettingsHomePage } from "./settings-home-page";
import { SettingsCalendarPage } from "./settings-calendar-page";
import { JournalManager } from "../journal-manager";
import type { SettingsRouteState } from "../contracts/settings";
import { SettingsCalendarSectionPage } from "./settings-calendar-section-page";
import { JournalConfigManager } from "../config/journal-config-manager";
import { SettingsIntervalPage } from "./settings-interval-page";

export class JournalSettingTab extends PluginSettingTab {
  private routeState: SettingsRouteState = {
    type: "home",
  };

  constructor(
    app: App,
    plugin: Plugin,
    private manager: JournalManager,
    private config: JournalConfigManager,
  ) {
    super(app, plugin);

    plugin.registerEvent(
      this.app.workspace.on("journal:settings-navigate", (state) => {
        this.routeState = state;
        this.display();
      }),
    );

    plugin.registerEvent(
      this.app.workspace.on("journal:settings-save", async (redraw: boolean) => {
        await this.config.save();
        if (redraw) this.display();
      }),
    );
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    switch (this.routeState.type) {
      case "home": {
        new SettingsHomePage(this.app, this.manager, containerEl, this.config).display();
        break;
      }
      case "journal": {
        const journalConfig = this.config.get(this.routeState.id);
        if (!journalConfig) {
          console.error("Unknown config");
          this.routeState = { type: "home" };
          this.display();
          return;
        }
        switch (journalConfig.type) {
          case "calendar": {
            if (this.routeState.section) {
              new SettingsCalendarSectionPage(
                this.app,
                journalConfig,
                containerEl,
                journalConfig[this.routeState.section],
                this.routeState.section,
                this.manager.calendar,
              ).display();
            } else {
              new SettingsCalendarPage(this.app, containerEl, journalConfig).display();
            }
            break;
          }
          case "interval": {
            new SettingsIntervalPage(
              this.app,
              this.manager,
              containerEl,
              journalConfig,
              this.manager.calendar,
            ).display();
            break;
          }
        }
        break;
      }
      default:
        console.error("not supported", this.routeState);
    }
  }
}
