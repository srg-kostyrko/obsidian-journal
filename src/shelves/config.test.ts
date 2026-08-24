import { describe, expect, it } from "vitest";

import { journalsCoreModule } from "@/journals/module";
import { testContainer } from "@/testing";

import { shelvesCollection } from "./config";
import { shelvesCoreModule } from "./module";

describe("shelvesCollection", () => {
  it("loads a shelf saved before decorations existed with an empty decoration list", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, shelvesCoreModule],
      data: { shelves: { work: { name: "work", journals: [] } } },
    });

    expect(harness.settings.recordOf(shelvesCollection).work.decorations).toEqual([]);
  });

  it("keeps a shelf's journals when its decorations fail to parse", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, shelvesCoreModule],
      data: {
        shelves: { work: { name: "work", journals: ["daily"], decorations: [{ type: "not-a-decoration" }] } },
      },
    });

    const shelf = harness.settings.recordOf(shelvesCollection).work;
    expect(shelf.journals).toEqual(["daily"]);
    expect(shelf.decorations).toEqual([]);
  });
});
