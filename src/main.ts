import { Plugin } from "obsidian";

import { Container } from "@/infrastructure/di";
import { LoggerModule } from "@/infrastructure/logger";
import { ObsidianAppToken, PluginToken } from "@/infrastructure/obsidian-tokens";

export default class JournalPlugin extends Plugin {
  #container?: Container;

  async onload(): Promise<void> {
    const container = new Container();
    container.register(PluginToken).useValue(this);
    container.register(ObsidianAppToken).useValue(this.app);
    container.addModule(LoggerModule);
    await container.autoLoad();
    this.#container = container;
  }

  onunload(): void {
    void this.#container?.dispose().catch(() => null);
    this.#container = undefined;
  }
}
