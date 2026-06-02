import { describe, expect, it } from "vitest";

import { journalConfigCollection } from "@/journals/config";
import { createSettingsService } from "@/settings/testing";

import { pendingNoteMigrationSlice } from "./pending-note-migration";

import { legacyMigrations } from "./index";

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
    const { service } = createSettingsService({
      raw: v1Raw(),
      collections: [journalConfigCollection],
      slices: [pendingNoteMigrationSlice],
      migrations: legacyMigrations,
    });
    const init = await service.initialize();
    expect(init.kind).toBe("ok");

    const journals = service.recordOf(journalConfigCollection);
    const sprints = Object.values(journals).find((journal) => journal.name === "Sprints");
    expect(sprints).toBeDefined();
    // write.type === "custom" proves the journal was reshaped (not reset to a default day journal)
    expect(sprints?.write.type).toBe("custom");
  });
});
