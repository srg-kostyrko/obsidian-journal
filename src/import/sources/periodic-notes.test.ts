import { describe, expect, it } from "vitest";

import { testContainer } from "@/testing";

import { importCoreModule } from "../module";
import { buildCalendarSet, buildPeriodicConfig, periodicNotesStorePlugin } from "../testing";

import { PeriodicNotesSource } from "./periodic-notes";

async function readWith(plugin: object | undefined) {
  const harness = await testContainer({ modules: [importCoreModule] });
  if (plugin !== undefined) harness.host.putPlugin("periodic-notes", plugin);
  return harness.resolve(PeriodicNotesSource).read();
}

describe("PeriodicNotesSource", () => {
  it("contributes nothing while Periodic Notes is not loaded", async () => {
    expect(await readWith(undefined)).toEqual({ kind: "absent" });
  });

  describe("1.x", () => {
    it("reads each enabled period of every calendar set", async () => {
      const read = await readWith(
        periodicNotesStorePlugin({
          calendarSets: [
            buildCalendarSet("Default", {
              day: buildPeriodicConfig({
                format: "YYYY/MM-MMM/DD-ddd",
                folder: "/Journal/",
                templatePath: "Templates/Daily",
              }),
              week: buildPeriodicConfig({ enabled: false }),
            }),
            buildCalendarSet("Work", { day: buildPeriodicConfig({ folder: "Work" }) }),
          ],
        }),
      );

      expect(read).toEqual({
        kind: "read",
        reading: {
          source: "periodic-notes",
          variant: "1.x",
          configured: true,
          journals: [
            {
              source: "periodic-notes",
              set: "Default",
              period: "day",
              folder: "Journal",
              format: "YYYY/MM-MMM/DD-ddd",
              templates: ["Templates/Daily"],
              openAtStartup: false,
            },
            {
              source: "periodic-notes",
              set: "Work",
              period: "day",
              folder: "Work",
              format: "YYYY-MM-DD",
              templates: [],
              openAtStartup: false,
            },
          ],
        },
      });
    });

    it("resolves an empty weekly format to Periodic Notes' own default", async () => {
      const read = await readWith(
        periodicNotesStorePlugin({ calendarSets: [buildCalendarSet("Default", { week: buildPeriodicConfig() })] }),
      );

      expect(read.kind === "read" && read.reading.journals.at(0)?.format).toBe("gggg-[W]ww");
    });

    it("keeps only the startup flag Periodic Notes itself would open", async () => {
      const read = await readWith(
        periodicNotesStorePlugin({
          calendarSets: [
            buildCalendarSet("Default", { week: buildPeriodicConfig({ openAtStartup: true }) }),
            buildCalendarSet("Work", { day: buildPeriodicConfig({ openAtStartup: true }) }),
          ],
        }),
      );

      expect(read.kind === "read" && read.reading.journals.map((journal) => journal.openAtStartup)).toEqual([
        true,
        false,
      ]);
    });

    it("prefers calendar sets over the older keys 1.x keeps beside them", async () => {
      const read = await readWith(
        periodicNotesStorePlugin({
          daily: { enabled: true, format: "old", folder: "Old" },
          calendarSets: [buildCalendarSet("Default", { day: buildPeriodicConfig({ folder: "New" }) })],
        }),
      );

      expect(read.kind === "read" && read.reading.variant).toBe("1.x");
    });

    it("reports calendar sets it cannot read as unrecognised", async () => {
      expect(await readWith(periodicNotesStorePlugin({ calendarSets: "broken" }))).toEqual({
        kind: "unrecognised",
        source: "periodic-notes",
      });
    });
  });

  describe("0.x", () => {
    it("reads each enabled period from a plain settings object", async () => {
      const read = await readWith({
        settings: {
          daily: { enabled: true, format: "", folder: "Daily", template: "" },
          weekly: { enabled: false, format: "", folder: "", template: "" },
          monthly: { enabled: true, format: "YYYY-MM", folder: "", template: "Templates/Month" },
        },
      });

      expect(read).toEqual({
        kind: "read",
        reading: {
          source: "periodic-notes",
          variant: "0.x",
          configured: true,
          journals: [
            {
              source: "periodic-notes",
              period: "day",
              folder: "Daily",
              format: "YYYY-MM-DD",
              templates: [],
              openAtStartup: false,
            },
            {
              source: "periodic-notes",
              period: "month",
              folder: "",
              format: "YYYY-MM",
              templates: ["Templates/Month"],
              openAtStartup: false,
            },
          ],
        },
      });
    });

    it("reports settings that are not an object as unrecognised", async () => {
      expect(await readWith({ settings: "broken" })).toEqual({ kind: "unrecognised", source: "periodic-notes" });
    });
  });
});
