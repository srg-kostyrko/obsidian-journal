import { App } from "obsidian";
import { SettingsRouteState } from "../contracts/settings";

export class SettingsWidget {
  constructor(protected app: App) {}

  navigate(state: SettingsRouteState): void {
    this.app.workspace.trigger("journal:settings-navigate", state);
  }

  save(redraw = false): void {
    this.app.workspace.trigger("journal:settings-save", redraw);
  }
}
