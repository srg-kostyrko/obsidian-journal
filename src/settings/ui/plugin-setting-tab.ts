import { PluginSettingTab } from "obsidian";
import { type App as VueApp, createApp } from "vue";

import { m } from "@/i18n";
import { inject, type Injector, InjectorToken, provideInjectorOnApp } from "@/infrastructure/di";
import { InternalObsidianAppToken, InternalPluginToken } from "@/infrastructure/host";

import { SettingsUiService } from "./settings-ui-service";
import SettingsDashboard from "./SettingsDashboard.vue";

export class PluginSettingTabAdapter extends PluginSettingTab {
  readonly #injector: Injector;
  readonly #ui: SettingsUiService;
  #vueApp: VueApp | undefined;

  // Obsidian labels the settings sidebar entry from this undocumented field, which the base
  // constructor seeds with the untranslatable manifest name.
  declare name: string;

  constructor() {
    const plugin = inject(InternalPluginToken);
    super(inject(InternalObsidianAppToken), plugin);
    this.#injector = inject(InjectorToken);
    this.#ui = inject(SettingsUiService);
    // Obsidian builds and caches the sidebar entry inside addSettingTab, so the title has to
    // be in place before it.
    this.name = m.settings_tab_title();
    plugin.addSettingTab(this);
  }

  display(): void {
    const app = createApp(SettingsDashboard);
    provideInjectorOnApp(app, this.#injector);
    this.#vueApp = app;
    app.mount(this.containerEl);
  }

  hide(): void {
    this.#vueApp?.unmount();
    this.#vueApp = undefined;
    this.containerEl.empty();
    this.#ui.reset();
  }

  [Symbol.dispose](): void {
    this.#vueApp?.unmount();
    this.#vueApp = undefined;
  }
}
