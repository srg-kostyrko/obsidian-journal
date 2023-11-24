import { Plugin } from "obsidian";
import { JournalConfig, PluginSettings } from "../contracts/config.types";
import { deepCopy } from "../utils";
import { DEFAULT_PLUGIN_SETTINGS } from "./config-defaults";

export class JournalConfigManager {
  private settings: PluginSettings;

  constructor(private plugin: Plugin) {}

  async load(): Promise<void> {
    const saved = await this.plugin.loadData();
    if (saved) {
      this.settings = saved;
    } else {
      this.settings = deepCopy(DEFAULT_PLUGIN_SETTINGS);
      await this.save();
    }
  }

  async save(): Promise<void> {
    await this.plugin.saveData(this.settings);
  }

  add(config: JournalConfig): void {
    this.settings.journals[config.id] = config;
  }

  get(id: string): JournalConfig | undefined {
    return this.settings.journals[id];
  }

  get defaultId(): string {
    return this.settings.defaultId;
  }

  set defaultId(id: string) {
    this.settings.defaultId = id;
  }

  get calendar() {
    return this.settings.calendar;
  }

  *[Symbol.iterator]() {
    for (const config of Object.values(this.settings.journals)) {
      yield config;
    }
  }
}
