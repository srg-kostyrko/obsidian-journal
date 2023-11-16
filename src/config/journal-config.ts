import { Plugin } from "obsidian";
import { JournalConfigs } from "../contracts/config.types";
import { DEFAULT_CONFIG_CALENDAR } from "./config-defaults";

const DEFAULT_CONFIG: JournalConfigs[] = [DEFAULT_CONFIG_CALENDAR];

export class JournalConfig {
  private configs: JournalConfigs[] = [];

  constructor(private plugin: Plugin) {}

  async load(): Promise<void> {
    this.configs = (await this.plugin.loadData()) ?? DEFAULT_CONFIG;
  }

  async save(): Promise<void> {
    await this.plugin.saveData(this.configs);
  }
}