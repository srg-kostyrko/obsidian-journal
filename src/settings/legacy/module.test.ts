import { describe, expect, it } from "vitest";

import { calendarSettingsCoreModule } from "@/calendar/settings/module";
import { FakePluginData } from "@/infrastructure/host/testing";
import { journalConfigCollection } from "@/journals/config";
import { journalsCoreModule } from "@/journals/module";
import { TestContainerUnknownSeedKeyError, testContainer } from "@/testing";

import { legacyMigrationsModule } from "./module";

function v1Raw() {
  return {
    journals: {
      int: {
        id: "int",
        type: "interval",
        name: "Sprints",
        duration: 2,
        granularity: "week",
        start_date: "2022-02-01",
        start_index: 1,
        numeration_type: "increment",
        end_type: "never",
        end_date: "",
        repeats: 1,
        limitCreation: false,
        openOnStartup: false,
        openMode: "active",
        nameTemplate: "",
        navNameTemplate: "",
        navDatesTemplate: "",
        dateFormat: "",
        folder: "",
        template: "",
        ribbon: { show: false, icon: "", tooltip: "" },
        createOnStartup: false,
        calendar_view: { order: "chrono" },
      },
    },
    calendar: { firstDayOfWeek: 1, firstWeekOfYear: 4 },
    calendar_view: { leaf: "left", weeks: "left" },
  };
}

describe("legacy migrations integration", () => {
  it("migrates a v1 interval journal into the journals collection with its custom write interval", async () => {
    const stored = new FakePluginData(v1Raw());
    const harness = await testContainer({
      modules: [journalsCoreModule, legacyMigrationsModule],
      pluginData: stored,
    });

    const journals = harness.settings.recordOf(journalConfigCollection);
    const sprints = Object.values(journals).find((journal) => journal.name === "Sprints");
    expect(sprints).toBeDefined();
    // write.type === "custom" proves the journal was reshaped (not reset to a default day journal)
    expect(sprints?.write.type).toBe("custom");
    // duration/every surviving too rules out the vacuity trap: a journal resolved from some other
    // "custom" default would not carry the source interval's own values.
    expect(sprints?.write).toMatchObject({ every: "week", duration: 2 });
  });

  it("accepts a pre-migration key named in allow.legacySeedKeys", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, legacyMigrationsModule, calendarSettingsCoreModule],
      data: { version: 0, ...v1Raw() },
      allow: { legacySeedKeys: ["calendar_view"] },
    });

    const journals = harness.settings.recordOf(journalConfigCollection);
    expect(Object.values(journals).find((journal) => journal.name === "Sprints")).toBeDefined();
  });

  it("still throws for a pre-migration key that is not named in allow.legacySeedKeys", async () => {
    await expect(
      testContainer({
        modules: [journalsCoreModule, legacyMigrationsModule, calendarSettingsCoreModule],
        data: { version: 0, ...v1Raw(), calender_view: { leaf: "left", weeks: "left" } },
        allow: { legacySeedKeys: ["calendar_view"] },
      }),
    ).rejects.toThrow(TestContainerUnknownSeedKeyError);
  });
});
