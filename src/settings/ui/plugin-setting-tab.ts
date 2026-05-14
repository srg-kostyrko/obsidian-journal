import { PluginSettingTab } from "obsidian";
import { type App as VueApp, type Component, createApp } from "vue";

import { inject, type Injector, InjectorToken, provideInjectorOnApp } from "@/infrastructure/di";
import { InternalObsidianAppToken, InternalPluginToken } from "@/infrastructure/host";

import { SettingsUiService } from "./settings-ui-service";
import SettingsDashboard from "./SettingsDashboard.vue";

export class PluginSettingTabAdapter extends PluginSettingTab {
  readonly #injector: Injector;
  readonly #ui: SettingsUiService;
  #vueApp: VueApp | undefined;

  constructor() {
    const plugin = inject(InternalPluginToken);
    super(inject(InternalObsidianAppToken), plugin);
    this.#injector = inject(InjectorToken);
    this.#ui = inject(SettingsUiService);
    plugin.addSettingTab(this);
  }

  display(): void {
    const app = createApp(SettingsDashboard as Component);
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
