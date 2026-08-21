import { describe, expect, it } from "vitest";

import { createFakeHost } from "./testing";

import type { PluginSettingTab } from "obsidian";

describe("createFakeHost", () => {
  it("starts with no setting tabs", () => {
    const host = createFakeHost();

    expect(host.settingTabs).toHaveLength(0);
  });

  it("records a tab passed to addSettingTab", () => {
    const host = createFakeHost();
    const tab = { id: "journals" } as unknown as PluginSettingTab;

    host.plugin.addSettingTab(tab);

    expect(host.settingTabs).toEqual([tab]);
  });
});
