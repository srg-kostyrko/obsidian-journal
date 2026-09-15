import { describe, expect, it } from "vitest";

import { testContainer } from "@/testing";

import { PluginSettingsReader } from "./plugin-settings-reader";

describe("PluginSettingsReader", () => {
  it("returns a loaded community plugin's instance", async () => {
    const harness = await testContainer({ modules: [] });
    const calendar = { options: { weekStart: "monday" } };
    harness.host.putPlugin("calendar", calendar);

    expect(harness.resolve(PluginSettingsReader).communityPlugin("calendar").getOrUndefined()).toBe(calendar);
  });

  it("returns nothing for a community plugin that is not loaded", async () => {
    const harness = await testContainer({ modules: [] });

    expect(harness.resolve(PluginSettingsReader).communityPlugin("calendar").isNone()).toBe(true);
  });

  it("returns an enabled core plugin's instance", async () => {
    const harness = await testContainer({ modules: [] });
    const dailyNotes = { options: { format: "YYYY-MM-DD" } };
    harness.host.putCorePlugin("daily-notes", dailyNotes);

    expect(harness.resolve(PluginSettingsReader).corePlugin("daily-notes").getOrUndefined()).toBe(dailyNotes);
  });

  it("returns nothing for a disabled core plugin", async () => {
    const harness = await testContainer({ modules: [] });
    harness.host.putCorePlugin("daily-notes", { options: { format: "YYYY-MM-DD" } }, false);

    expect(harness.resolve(PluginSettingsReader).corePlugin("daily-notes").isNone()).toBe(true);
  });
});
