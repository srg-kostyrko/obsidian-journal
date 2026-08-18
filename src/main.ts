import { getLanguage, Notice, Plugin } from "obsidian";

import "./styles.css";

import { apiModule, JournalsApiService } from "@/api";
import type { JournalsApi } from "@/api";
import { CalendarModule, calendarSettingsModule } from "@/calendar";
import { codeBlocksModule } from "@/code-blocks";
import { navBlockSettingsModule } from "@/code-blocks/nav/settings/module";
import { commandsModule } from "@/commands";
import { DynamicCommandRegistry } from "@/commands/command-registry";
import { decorationsModule } from "@/decorations";
import { decorationsSettingsModule } from "@/decorations/settings/module";
import { initLocale, m } from "@/i18n";
import { Container } from "@/infrastructure/di";
import { FlowsModule } from "@/infrastructure/flows";
import { createHostModule } from "@/infrastructure/host";
import { LoggerModule } from "@/infrastructure/logger";
import { AutoAttachService, AutoCreateService, JournalUriHandler, StartupOpenService } from "@/journals";
import { journalsModule } from "@/journals/module";
import { journalsSettingsModule } from "@/journals/settings/module";
import { startupModule } from "@/journals/startup/module";
import { VaultSubscriptionService } from "@/journals/vault-subscription";
import { loggingModule } from "@/logging";
import { maintenanceModule } from "@/maintenance";
import { notesCalendarModule } from "@/notes-calendar";
import { calendarAppearanceModule } from "@/notes-calendar/appearance/module";
import { settingsModule, SettingsService } from "@/settings";
import { DataMigrationService, legacyMigrationsModule } from "@/settings/legacy";
import { shelvesModule } from "@/shelves";
import { templatesModule } from "@/templates";
import { viewsModule, ViewHostService } from "@/views";

export default class JournalPlugin extends Plugin {
  #container?: Container;

  /** The public plugin API. See docs/plugin-api.md. */
  api?: JournalsApi;

  async onload(): Promise<void> {
    initLocale(getLanguage());

    const container = new Container();
    container.addModule(LoggerModule);
    container.addModule(FlowsModule);
    container.addModule(createHostModule(this));
    container.addModule(settingsModule);
    container.addModule(legacyMigrationsModule);
    container.addModule(CalendarModule);
    container.addModule(templatesModule);
    container.addModule(calendarSettingsModule);
    container.addModule(journalsModule);
    container.addModule(journalsSettingsModule);
    container.addModule(decorationsModule);
    container.addModule(decorationsSettingsModule);
    container.addModule(notesCalendarModule);
    container.addModule(calendarAppearanceModule);
    container.addModule(shelvesModule);
    container.addModule(viewsModule);
    container.addModule(codeBlocksModule);
    container.addModule(navBlockSettingsModule);
    container.addModule(commandsModule);
    container.addModule(startupModule);
    container.addModule(loggingModule);
    container.addModule(maintenanceModule);
    container.addModule(apiModule);

    const init = await container.resolve(SettingsService).initialize();
    if (init.kind === "err") {
      new Notice(m.settings_load_failed({ error: init.error.message }));
      await container.dispose();
      return;
    }

    // Before autoLoad on purpose: assigning at the end of onload would leave `api` undefined
    // during our own async initialization, and a consumer probing then reads "Journals is not
    // installed" rather than "not ready yet".
    this.api = container.resolve(JournalsApiService);

    await container.autoLoad();

    await container.resolve(VaultSubscriptionService).initialize();
    await container.resolve(DataMigrationService).initialize();
    await container.resolve(AutoAttachService).initialize();
    await container.resolve(AutoCreateService).initialize();
    await container.resolve(StartupOpenService).initialize();
    container.resolve(ViewHostService).initialize();
    container.resolve(DynamicCommandRegistry).initialize();
    container.resolve(JournalUriHandler).initialize();

    this.#container = container;
  }

  onExternalSettingsChange(): void {
    const container = this.#container;
    if (!container) return;
    void container
      .resolve(SettingsService)
      .reload()
      .tapErr((error) => new Notice(m.settings_reload_failed({ error: error.message })));
  }

  onunload(): void {
    this.api = undefined;
    void this.#container?.dispose().catch(() => null);
    this.#container = undefined;
  }
}
