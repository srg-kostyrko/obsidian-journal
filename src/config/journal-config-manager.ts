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
      if (!this.settings.calendar_view) {
        this.settings.calendar_view = deepCopy(DEFAULT_PLUGIN_SETTINGS.calendar_view);
        await this.save();
      }
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

  delete(id: string): void {
    delete this.settings.journals[id];
  }

  get size(): number {
    return Object.keys(this.settings.journals).length;
  }

  get calendar() {
    return this.settings.calendar;
  }

  get calendarView() {
    return this.settings.calendar_view;
  }

  *[Symbol.iterator]() {
    for (const config of Object.values(this.settings.journals)) {
      yield config;
    }
  }
}
