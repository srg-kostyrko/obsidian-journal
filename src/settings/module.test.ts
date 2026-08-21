import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";
import { isOrderedSubsequence, registrationOrder } from "@/infrastructure/di/testing";
import { InternalObsidianAppToken, InternalPluginToken, PluginData } from "@/infrastructure/host";
import { createFakeHost } from "@/infrastructure/host/internal/testing";
import { FakePluginData } from "@/infrastructure/host/testing";
import { LoggerModule } from "@/infrastructure/logger";

import { settingsCoreModule, settingsModule } from "./module";
import { SettingsService } from "./settings-service";

function build(module: typeof settingsCoreModule) {
  const host = createFakeHost();
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(InternalPluginToken).useValue(host.plugin);
  c.register(InternalObsidianAppToken).useValue(host.app);
  c.addModule(module);
  c.register(PluginData).useValue(new FakePluginData() as unknown as PluginData);
  return { c, host };
}

describe("settingsCoreModule", () => {
  it("resolves SettingsService", () => {
    const { c } = build(settingsCoreModule);

    expect(c.resolve(SettingsService)).toBeInstanceOf(SettingsService);
  });

  it("registers no settings tab on the host during autoLoad", async () => {
    const { c, host } = build(settingsCoreModule);

    await c.autoLoad();

    expect(host.settingTabs).toHaveLength(0);
  });
});

describe("settingsModule", () => {
  it("registers the settings tab on the host during autoLoad", async () => {
    const { c, host } = build(settingsModule);

    await c.autoLoad();

    expect(host.settingTabs).toHaveLength(1);
  });
});

describe("settingsCoreModule against settingsModule", () => {
  it("registers its tokens in the same relative order as the full module", () => {
    const core = registrationOrder(settingsCoreModule);
    const full = registrationOrder(settingsModule);

    expect(isOrderedSubsequence(core, full)).toBe(true);
  });

  it("registers no token the full module omits", () => {
    const core = registrationOrder(settingsCoreModule);
    const full = new Set(registrationOrder(settingsModule));

    expect(core.filter((name) => !full.has(name))).toEqual([]);
  });
});
