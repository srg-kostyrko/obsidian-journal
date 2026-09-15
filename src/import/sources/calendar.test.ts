import { describe, expect, it } from "vitest";

import { testContainer } from "@/testing";

import { importCoreModule } from "../module";

import { CalendarSource } from "./calendar";

async function readWith(options: object | undefined) {
  const harness = await testContainer({ modules: [importCoreModule] });
  if (options !== undefined) harness.host.putPlugin("calendar", { options });
  return harness.resolve(CalendarSource).read();
}

describe("CalendarSource", () => {
  it("contributes nothing while Calendar is not loaded", async () => {
    expect(await readWith(undefined)).toEqual({ kind: "absent" });
  });

  it("reads a named week start as that weekday", async () => {
    const read = await readWith({ weekStart: "sunday" });

    expect(read.kind === "read" && read.reading.weekStart).toEqual({ kind: "day", dow: 0 });
  });

  it("offers no weekly journal while weekly notes are hidden", async () => {
    const read = await readWith({ weekStart: "locale", showWeeklyNote: false, weeklyNoteFolder: "Weekly" });

    expect(read.kind === "read" && read.reading.journals).toEqual([]);
  });

  it("reads the weekly note setup when weekly notes are shown", async () => {
    const read = await readWith({
      showWeeklyNote: true,
      weeklyNoteFormat: "",
      weeklyNoteFolder: "Weekly",
      weeklyNoteTemplate: "",
    });

    expect(read.kind === "read" && read.reading.journals).toEqual([
      {
        source: "calendar",
        period: "week",
        folder: "Weekly",
        format: "gggg-[W]ww",
        templates: [],
        openAtStartup: false,
      },
    ]);
  });

  it("reports a week start it does not know as unrecognised", async () => {
    expect(await readWith({ weekStart: "someday" })).toEqual({ kind: "unrecognised", source: "calendar" });
  });
});
