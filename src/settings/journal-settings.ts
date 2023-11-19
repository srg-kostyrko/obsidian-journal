import { PluginSettingTab, Plugin, App } from "obsidian";
import { JournalConfig } from "../config/journal-config";
import { SettingsHomePage } from "./settings-home-page";
import { Disposable } from "../contracts/disposable.types";
import { SettingsCalendarPage } from "./settings-calendar-page";
import { JournalManager } from "../journal-manager";

type RouteState =
  | {
      type: "home";
    }
  | {
      type: "journal";
      id: string;
    };

export class JournalSettingTab extends PluginSettingTab {
  private routeState: RouteState = {
    type: "home",
  };
  private disposables: Disposable[] = [];

  constructor(
    app: App,
    plugin: Plugin,
    private manager: JournalManager,
    private config: JournalConfig,
  ) {
    super(app, plugin);
  }

  display() {
    const { containerEl } = this;

    this.cleanup();
    containerEl.empty();

    switch (this.routeState.type) {
      case "home": {
        const homePage = new SettingsHomePage(this.app, this.manager, containerEl, this.config);
        this.disposables.push(homePage);
        homePage.on("navigate", (state) => {
          this.routeState = state;
          this.display();
        });
        homePage.on("redraw", () => {
          this.display();
        });
        homePage.display();
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
            const calendarPage = new SettingsCalendarPage(this.app, containerEl, journalConfig);
            this.disposables.push(calendarPage);
            calendarPage.on("navigate", (state) => {
              this.routeState = state;
              this.display();
            });
            calendarPage.on("save", async () => await this.config.save());
            calendarPage.on("save+redraw", async () => {
              await this.config.save();
              this.display();
            });
            calendarPage.display();
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

  private cleanup() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
