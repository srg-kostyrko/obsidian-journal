import { Plugin } from "obsidian";

import { Container } from "@/infrastructure/di";
import { ObsidianAppToken, PluginToken } from "@/infrastructure/obsidian-tokens";

export default class JournalPlugin extends Plugin {
  #container?: Container;

  async onload(): Promise<void> {
    const container = new Container();
    container.register(PluginToken).useValue(this);
    container.register(ObsidianAppToken).useValue(this.app);
    await container.autoLoad();
    this.#container = container;
  }

  onunload(): void {
    void this.#container?.dispose();
    this.#container = undefined;
  }
}
