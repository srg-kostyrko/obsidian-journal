import { Plugin } from "obsidian";

import { CalendarModule } from "@/calendar";
import { Container } from "@/infrastructure/di";
import { FlowsModule } from "@/infrastructure/flows";
import { createHostModule } from "@/infrastructure/host";
import { LoggerModule } from "@/infrastructure/logger";

export default class JournalPlugin extends Plugin {
  #container?: Container;

  async onload(): Promise<void> {
    const container = new Container();
    container.addModule(LoggerModule);
    container.addModule(FlowsModule);
    container.addModule(createHostModule(this));
    container.addModule(CalendarModule);
    await container.autoLoad();
    this.#container = container;
  }

  onunload(): void {
    void this.#container?.dispose().catch(() => null);
    this.#container = undefined;
  }
}
