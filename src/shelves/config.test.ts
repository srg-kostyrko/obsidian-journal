import { describe, expect, it } from "vitest";

import { createSettingsService } from "@/settings/testing";
import { CURRENT_VERSION } from "@/settings/version";

import { shelvesCollection } from "./config";

describe("shelvesCollection", () => {
  it("loads a shelf saved before decorations existed with an empty decoration list", async () => {
    const { service } = createSettingsService({
      raw: { version: CURRENT_VERSION, shelves: { work: { name: "work", journals: [] } } },
      collections: [shelvesCollection],
    });
    await service.initialize();
    expect(service.recordOf(shelvesCollection).work.decorations).toEqual([]);
  });

  it("keeps a shelf's journals when its decorations fail to parse", async () => {
    const { service } = createSettingsService({
      raw: {
        version: CURRENT_VERSION,
        shelves: { work: { name: "work", journals: ["daily"], decorations: [{ type: "not-a-decoration" }] } },
      },
      collections: [shelvesCollection],
    });
    await service.initialize();
    const shelf = service.recordOf(shelvesCollection).work;
    expect(shelf.journals).toEqual(["daily"]);
    expect(shelf.decorations).toEqual([]);
  });
});
