import { getLanguage, Notice, Plugin } from "obsidian";

import "./styles.css";

import { CalendarModule, calendarSettingsModule } from "@/calendar";
import { codeBlocksModule } from "@/code-blocks";
import { NavReferenceIntegrity } from "@/code-blocks/nav/nav-reference-integrity";
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
import { notesCalendarModule } from "@/notes-calendar";
import { calendarAppearanceModule } from "@/notes-calendar/appearance/module";
import { settingsModule, SettingsService } from "@/settings";
import { DataMigrationService, legacyMigrationsModule } from "@/settings/legacy";
import { shelvesModule } from "@/shelves";
import { templatesModule } from "@/templates";
import { viewsModule, ViewHostService } from "@/views";

export default class JournalPlugin extends Plugin {
  #container?: Container;

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
    container.register(NavReferenceIntegrity).useClass(NavReferenceIntegrity).eager();
    container.addModule(commandsModule);
    container.addModule(startupModule);
    container.addModule(loggingModule);

    const init = await container.resolve(SettingsService).initialize();
    if (init.kind === "err") {
      new Notice(m.settings_load_failed({ error: init.error.message }));
      await container.dispose();
      return;
    }

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
    void this.#container?.dispose().catch(() => null);
    this.#container = undefined;
  }
}
