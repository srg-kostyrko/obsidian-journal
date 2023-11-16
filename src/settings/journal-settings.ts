import { PluginSettingTab, Plugin, App } from "obsidian";
import { JournalConfig } from "../config/journal-config";
import { SettingsHomePage } from "./settings-home-page";
import { Disposable } from "../contracts/disposable.types";

type RouteState =
  | {
      type: "home";
    }
  | {
      type: "journal";
      index: number;
    };

export class JournalSettingTab extends PluginSettingTab {
  private routeState: RouteState = {
    type: "home",
  };
  private disposables: Disposable[] = [];

  constructor(
    app: App,
    plugin: Plugin,
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
        const homePage = new SettingsHomePage(containerEl, this.config);
        this.disposables.push(homePage);
        homePage.on("navigate", (state) => {
          this.routeState = state;
          this.display();
        });
        homePage.display();
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
