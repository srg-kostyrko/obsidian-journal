import { safeParse } from "valibot";
import { describe, expect, it } from "vitest";

import { journalConfigCollection } from "@/journals/config";
import { runMigrations } from "@/settings/migrations";

import { legacyMigrations } from "./index";

import type { PluginSettingsV1 } from "./old-shapes";

function v1(): PluginSettingsV1 {
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

describe("legacy migration chain", () => {
  it("migrates a v1 blob (no version) up to version 4", () => {
    const result = runMigrations(v1() as unknown as Record<string, unknown>, legacyMigrations, 4);
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.value.version).toBe(4);
  });

  it("produces journals that parse against the new collection schema", () => {
    const result = runMigrations(v1() as unknown as Record<string, unknown>, legacyMigrations, 4);
    if (result.kind !== "ok") throw new Error("expected ok");
    const journals = result.value.journals as Record<string, unknown>;
    const item = Object.values(journals)[0];
    const parsed = safeParse(journalConfigCollection.itemSchema, item);
    expect(parsed.success).toBe(true);
  });
});
