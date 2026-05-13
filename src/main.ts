import { Plugin } from "obsidian";

import { CalendarModule } from "@/calendar";
import { Container } from "@/infrastructure/di";
import { FlowsModule } from "@/infrastructure/flows";
import { LoggerModule } from "@/infrastructure/logger";
import { ObsidianAppToken, PluginToken } from "@/infrastructure/obsidian-tokens";

export default class JournalPlugin extends Plugin {
  #container?: Container;

  async onload(): Promise<void> {
    const container = new Container();
    container.register(PluginToken).useValue(this);
    container.register(ObsidianAppToken).useValue(this.app);
    container.addModule(LoggerModule);
    container.addModule(FlowsModule);
    container.addModule(CalendarModule);
    await container.autoLoad();
    this.#container = container;
  }

  onunload(): void {
    void this.#container?.dispose().catch(() => null);
    this.#container = undefined;
  }
}
