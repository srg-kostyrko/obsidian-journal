import { PluginSettingTab, Plugin, App } from "obsidian";
import { JournalConfig } from "../config/journal-config";
import { SettingsHomePage } from "./settings-home-page";
import { SettingsCalendarPage } from "./settings-calendar-page";
import { JournalManager } from "../journal-manager";
import { SettingsRouteState } from "../contracts/settings";
import { SettingsCalendarSectionPage } from "./settings-calendar-section-page";
import { SettingsCalendarWeeklySectionPage } from "./settings-calendar-weekly-section-page";

export class JournalSettingTab extends PluginSettingTab {
  private routeState: SettingsRouteState = {
    type: "home",
  };

  constructor(
    app: App,
    plugin: Plugin,
    private manager: JournalManager,
    private config: JournalConfig,
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
              const page =
                this.routeState.section === "weekly"
                  ? new SettingsCalendarWeeklySectionPage(
                      this.app,
                      journalConfig,
                      containerEl,
                      journalConfig[this.routeState.section],
                      this.routeState.section,
                    )
                  : new SettingsCalendarSectionPage(
                      this.app,
                      journalConfig,
                      containerEl,
                      journalConfig[this.routeState.section],
                      this.routeState.section,
                    );
              page.display();
            } else {
              new SettingsCalendarPage(this.app, containerEl, journalConfig).display();
            }
            break;
          }
          default:
            console.log("not supported", journalConfig.type);
        }
        break;
      }
      default:
        console.log("not supported", this.routeState);
    }
  }
}
