import { describe, expect, it } from "vitest";

import { findCollidingJournals } from "./colliding-journals";

function journal(name: string, overrides: Partial<{ nameTemplate: string; folder: string; dateFormat: string }> = {}) {
  return { name, nameTemplate: "{{date}}", folder: "", dateFormat: "YYYY-MM-DD", ...overrides };
}

describe("findCollidingJournals", () => {
  it("groups journals that resolve to the same path", () => {
    const groups = findCollidingJournals([journal("daily"), journal("diary")]);
    expect(groups.map((group) => group.map((journal) => journal.name))).toEqual([["daily", "diary"]]);
  });

  it("does not flag journals that differ by folder", () => {
    expect(findCollidingJournals([journal("a", { folder: "x" }), journal("b", { folder: "y" })])).toEqual([]);
  });

  it("does not flag journals whose only difference is the journal-name variable", () => {
    const configs = [
      journal("a", { nameTemplate: "{{journal_name}}/{{date}}" }),
      journal("b", { nameTemplate: "{{journal_name}}/{{date}}" }),
    ];
    expect(findCollidingJournals(configs)).toEqual([]);
  });
});
