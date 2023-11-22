import { Plugin } from "obsidian";
import { JournalConfigs } from "../contracts/config.types";
import { deepCopy } from "../utils";
import { DEFAULT_CONFIG_CALENDAR } from "./config-defaults";

export class JournalConfig {
  private configs: JournalConfigs[] = [];

  constructor(private plugin: Plugin) {}

  async load(): Promise<void> {
    const saved = await this.plugin.loadData();
    if (saved) {
      this.configs = saved;
    } else {
      this.configs = [deepCopy(DEFAULT_CONFIG_CALENDAR)];
      await this.save();
    }
  }

  async save(): Promise<void> {
    await this.plugin.saveData(this.configs);
  }

  add(config: JournalConfigs): void {
    this.configs.push(config);
  }

  get(id: string): JournalConfigs | undefined {
    return this.configs.find((c) => c.id === id);
  }

  *[Symbol.iterator]() {
    for (const config of this.configs) {
      yield config;
    }
  }
}
