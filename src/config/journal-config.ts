import { Plugin } from "obsidian";
import { JournalConfigs } from "../contracts/config.types";
import { deepCopy, generateId } from "../utils";
import { DEFAULT_CONFIG_CALENDAR } from "./config-defaults";

export class JournalConfig {
  private configs: JournalConfigs[] = [];

  constructor(private plugin: Plugin) {}

  async load(): Promise<void> {
    const saved = await this.plugin.loadData();
    if (saved) {
      this.configs = saved;
    } else {
      this.configs = [
        {
          ...deepCopy(DEFAULT_CONFIG_CALENDAR),
          id: generateId(),
        },
      ];
      await this.save();
    }
  }

  async save(): Promise<void> {
    await this.plugin.saveData(this.configs);
  }

  get(index: number): JournalConfigs | undefined {
    return this.configs[index];
  }

  *[Symbol.iterator]() {
    for (let i = 0; i < this.configs.length; ++i) {
      yield [this.configs[i], i] as [JournalConfigs, number];
    }
  }
}
