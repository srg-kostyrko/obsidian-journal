import { describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";

import type { Module } from "@/infrastructure/di";
import { testContainer } from "@/testing";

import { SubpageToken } from "../tokens";

import { PluginSettingTabAdapter } from "./plugin-setting-tab";
import { defineSubpage } from "./schema";
import { SettingsUiService } from "./settings-ui-service";

const testSubpage = defineSubpage({ key: "test-subpage", component: defineComponent({ render: () => h("div") }) });

// settingsCoreModule is already part of testContainer's default wiring, so this registers only
// what settingsModule adds beyond it — registering settingsModule here would double-bind
// settingsCoreModule's single tokens.
function pluginSettingTabModule(): Module {
  return {
    register(c) {
      c.register(PluginSettingTabAdapter).useClass(PluginSettingTabAdapter).eager();
    },
  };
}

function testSubpageModule(): Module {
  return {
    register(c) {
      c.register(SubpageToken).useValue(testSubpage);
    },
  };
}

describe("PluginSettingTabAdapter", () => {
  it("mounts the settings dashboard into containerEl on display", async () => {
    const harness = await testContainer({ modules: [pluginSettingTabModule()], allow: { hostState: true } });
    const tab = harness.resolve(PluginSettingTabAdapter);

    tab.display();

    expect(tab.containerEl.childElementCount).toBeGreaterThan(0);
  });

  it("tears down the mounted app and resets settings navigation on hide", async () => {
    const harness = await testContainer({
      modules: [pluginSettingTabModule(), testSubpageModule()],
      allow: { hostState: true },
    });
    const tab = harness.resolve(PluginSettingTabAdapter);
    const ui = harness.resolve(SettingsUiService);
    tab.display();
    ui.push(testSubpage, undefined);
    // Vue records the mounted app on its root element (used by devtools), which lets this spy
    // on the real instance rather than on containerEl.empty() — a DOM clear that would happen
    // either way and so cannot tell "the app was unmounted" from "the container was cleared".
    const vueApp = (tab.containerEl as unknown as { __vue_app__: { unmount: () => void } }).__vue_app__;
    const unmountSpy = vi.spyOn(vueApp, "unmount");

    tab.hide();

    expect(unmountSpy).toHaveBeenCalledTimes(1);
    expect(tab.containerEl.childElementCount).toBe(0);
    expect(ui.current.value).toBeNull();
  });
});
