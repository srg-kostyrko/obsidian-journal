import { getLanguage, Notice, Plugin } from "obsidian";

import { CalendarModule, calendarSettingsModule } from "@/calendar";
import { initLocale } from "@/i18n";
import { Container } from "@/infrastructure/di";
import { FlowsModule } from "@/infrastructure/flows";
import { createHostModule } from "@/infrastructure/host";
import { LoggerModule } from "@/infrastructure/logger";
import { AutoAttachService, AutoCreateService } from "@/journals";
import { journalsModule } from "@/journals/module";
import { journalsSettingsModule } from "@/journals/settings/module";
import { VaultSubscriptionService } from "@/journals/vault-subscription";
import { settingsModule, SettingsService } from "@/settings";
import { templatesModule } from "@/templates";

export default class JournalPlugin extends Plugin {
  #container?: Container;

  async onload(): Promise<void> {
    initLocale(getLanguage());

    const container = new Container();
    container.addModule(LoggerModule);
    container.addModule(FlowsModule);
    container.addModule(createHostModule(this));
    container.addModule(settingsModule);
    container.addModule(CalendarModule);
    container.addModule(templatesModule);
    container.addModule(calendarSettingsModule);
    container.addModule(journalsModule);
    container.addModule(journalsSettingsModule);
    await container.autoLoad();

    const init = await container.resolve(SettingsService).initialize();
    if (init.kind === "err") {
      new Notice(`Journal: failed to load settings — ${init.error.message}`);
      await container.dispose();
      return;
    }

    await container.resolve(VaultSubscriptionService).initialize();
    await container.resolve(AutoAttachService).initialize();
    await container.resolve(AutoCreateService).initialize();

    this.#container = container;
  }

  onunload(): void {
    void this.#container?.dispose().catch(() => null);
    this.#container = undefined;
  }
}
