import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { Module } from "@/infrastructure/di";
import { SliceDefinitionToken } from "@/settings";
import { testContainer } from "@/testing";

import { pendingNoteMigrationSlice, pendingNoteMigrationSchema } from "./pending-note-migration";

describe("pendingNoteMigration slice", () => {
  it("defaults to an empty list", () => {
    expect(pendingNoteMigrationSlice.defaults).toEqual([]);
  });

  it("parses an interval marker entry", () => {
    const entry = { oldJournalId: "abc", kind: "interval", name: "My Interval" };
    expect(v.parse(pendingNoteMigrationSchema, [entry])).toEqual([entry]);
  });

  it("parses a calendar marker entry with a section map", () => {
    const entry = {
      oldJournalId: "abc",
      kind: "calendar",
      sectionToName: { day: "My Journal Day", week: "My Journal Week" },
    };
    expect(v.parse(pendingNoteMigrationSchema, [entry])).toEqual([entry]);
  });
});

const sliceModule: Module = {
  register(c) {
    c.register(SliceDefinitionToken).useValue(pendingNoteMigrationSlice);
  },
};

describe("pendingNoteMigration slice repair on load", () => {
  // A section missing from the map strips the legacy keys from that section's notes, so a marker
  // whose map cannot be read must not survive with any part of it lost.
  it.each([
    ["a map that is not an object", "day"],
    ["a map with one unreadable section", { day: "Daily", week: 7 }],
  ])("a calendar marker with %s is dropped, keeping the other marker", async (_label, sectionToName) => {
    const kept = { oldJournalId: "def", kind: "interval", name: "Sprints" };
    const harness = await testContainer({
      modules: [sliceModule],
      data: { pendingNoteMigration: [{ oldJournalId: "abc", kind: "calendar", sectionToName }, kept] },
      allow: { dataRepair: true },
    });

    expect(harness.settings.getSlice(pendingNoteMigrationSlice).state).toEqual([kept]);
  });
});
