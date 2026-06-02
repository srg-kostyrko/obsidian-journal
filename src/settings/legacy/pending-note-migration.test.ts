import * as v from "valibot";
import { describe, expect, it } from "vitest";

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
