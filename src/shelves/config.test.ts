import { describe, expect, it } from "vitest";

import { buildCalendarDecoration, buildCondition, buildStyle } from "@/decorations/testing";
import { journalsCoreModule } from "@/journals/module";
import { testContainer } from "@/testing";

import { shelvesCollection } from "./config";
import { shelvesCoreModule } from "./module";

async function load(decorations: unknown) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule],
    data: { shelves: { work: { name: "work", journals: ["daily"], decorations } } },
    allow: { dataRepair: true },
  });
  const repair = harness.logs.records.find((record) => record.message === "collection entry fields reset to defaults");
  return { shelf: harness.settings.recordOf(shelvesCollection).work, repair };
}

describe("shelvesCollection", () => {
  it("loads a shelf saved before decorations existed with an empty decoration list", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, shelvesCoreModule],
      data: { shelves: { work: { name: "work", journals: [] } } },
    });

    expect(harness.settings.recordOf(shelvesCollection).work.decorations).toEqual([]);
  });

  it("keeps a shelf's journals when its only decoration fails to parse", async () => {
    const { shelf, repair } = await load([{ type: "not-a-decoration" }]);

    expect(shelf.journals).toEqual(["daily"]);
    expect(shelf.decorations).toEqual([]);
    expect(repair?.fields).toMatchObject({ sliceKey: "shelves/work", fields: ["decorations"] });
  });

  it("drops only the decoration that fails to parse, keeping its siblings", async () => {
    const kept = buildCalendarDecoration({
      conditions: [buildCondition("weekday", { weekdays: [1] })],
      styles: [buildStyle("color")],
    });

    const { shelf, repair } = await load([{ mode: "and", conditions: [{ type: "moon-phase" }], styles: [] }, kept]);

    expect(shelf.journals).toEqual(["daily"]);
    expect(shelf.decorations).toEqual([kept]);
    expect(repair?.fields).toMatchObject({ sliceKey: "shelves/work", fields: ["decorations.0"] });
  });
});
