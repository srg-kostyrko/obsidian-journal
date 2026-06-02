import { describe, expect, it } from "vitest";

import { v1ToV2Migration } from "./v1-to-v2";

import type { PluginSettingsV1 } from "./old-shapes";

function section(enabled: boolean) {
  return {
    enabled,
    openMode: "active" as const,
    nameTemplate: "",
    dateFormat: "",
    folder: "",
    template: "",
    ribbon: { show: false, icon: "", tooltip: "" },
    createOnStartup: false,
  };
}

function v1Fixture(): PluginSettingsV1 {
  return {
    journals: {
      cal: {
        type: "calendar",
        id: "cal",
        name: "My Journal",
        rootFolder: "",
        openOnStartup: false,
        startupSection: "day",
        day: section(true),
        week: section(true),
        month: section(false),
        quarter: section(false),
        year: section(false),
      },
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

describe("v1ToV2Migration", () => {
  it("targets version 0 -> 2", () => {
    expect(v1ToV2Migration.fromVersion).toBe(0);
    expect(v1ToV2Migration.toVersion).toBe(2);
  });

  it("splits a calendar journal into one journal per enabled section", () => {
    const out = v1ToV2Migration.migrate(v1Fixture() as unknown as Record<string, unknown>);
    const journals = out.journals as Record<string, unknown>;
    expect(Object.keys(journals)).toEqual(expect.arrayContaining(["My Journal Day", "My Journal Week", "Sprints"]));
    expect(journals["My Journal Month"]).toBeUndefined();
  });

  it("groups calendar sections under a shelf named after the old journal", () => {
    const out = v1ToV2Migration.migrate(v1Fixture() as unknown as Record<string, unknown>);
    const shelves = out.shelves as Record<string, { name: string; journals: string[] }>;
    expect(shelves["My Journal"].journals).toEqual(["My Journal Day", "My Journal Week"]);
  });

  it("carries the locale sentinel through unchanged", () => {
    const v1 = v1Fixture();
    v1.calendar.firstDayOfWeek = -1;
    const out = v1ToV2Migration.migrate(v1 as unknown as Record<string, unknown>);
    expect((out.calendar as { dow: number }).dow).toBe(-1);
  });

  it("records a calendar marker keyed by old id with final journal names", () => {
    const out = v1ToV2Migration.migrate(v1Fixture() as unknown as Record<string, unknown>);
    const marker = out.pendingNoteMigration as Record<string, unknown>[];
    expect(marker).toContainEqual({
      oldJournalId: "cal",
      kind: "calendar",
      sectionToName: { day: "My Journal Day", week: "My Journal Week" },
    });
    expect(marker).toContainEqual({ oldJournalId: "int", kind: "interval", name: "Sprints" });
  });

  it("de-duplicates journal names across calendar and interval journals", () => {
    const v1 = v1Fixture();
    const cal = v1.journals.cal;
    if (cal.type !== "calendar") throw new Error("fixture calendar journal missing");
    cal.week = section(false);
    const int = v1.journals.int;
    if (int.type !== "interval") throw new Error("fixture interval journal missing");
    int.name = "My Journal Day";

    const out = v1ToV2Migration.migrate(v1 as unknown as Record<string, unknown>);

    const journals = out.journals as Record<string, unknown>;
    expect(Object.keys(journals)).toEqual(expect.arrayContaining(["My Journal Day", "My Journal Day 2"]));
    const marker = out.pendingNoteMigration as Record<string, unknown>[];
    expect(marker).toContainEqual({ oldJournalId: "int", kind: "interval", name: "My Journal Day 2" });
  });
});
