import { describe, expect, it } from "vitest";

import type { NoteStructure, VaultPath } from "@/infrastructure/host";

import { composeFilters, matchesFilter } from "./filter";
import { buildTaskItem } from "./testing";

import type { TaskRule } from "./conditions";

const path = "Daily/2026-09-22.md" as VaultPath;

const structure: NoteStructure = {
  listItems: [
    { marker: " ", line: 3, endLine: 3, parent: null },
    { marker: " ", line: 7, endLine: 7, parent: null },
  ],
  tags: [{ tag: "#work", line: 3 }],
  headings: [
    { heading: "## Tasks", level: 2, line: 1 },
    { heading: "## Log", level: 2, line: 5 },
  ],
  frontmatterTags: [],
};

const under = (heading: string): TaskRule => ({
  mode: "and",
  conditions: [{ type: "heading", condition: "under", headings: [heading] }],
});

describe("matchesFilter", () => {
  it("matches a status alias", () => {
    const filter: TaskRule = { mode: "and", conditions: [{ type: "status", condition: "is", statuses: ["open"] }] };
    expect(matchesFilter(buildTaskItem({ status: "in-progress" }), structure, filter)).toBe(true);
    expect(matchesFilter(buildTaskItem({ status: "done" }), structure, filter)).toBe(false);
  });

  it("matches a heading by the item's own heading chain", () => {
    const item = buildTaskItem({
      display: { kind: "line", path, line: 3, endLine: 3, parentLine: null, markdown: null },
    });
    expect(matchesFilter(item, structure, under("## Tasks"))).toBe(true);
    expect(matchesFilter(item, structure, under("## Log"))).toBe(false);
  });

  it("matches a tag within the item's line range", () => {
    const item = buildTaskItem({
      display: { kind: "line", path, line: 3, endLine: 3, parentLine: null, markdown: null },
    });
    const other = buildTaskItem({
      display: { kind: "line", path, line: 7, endLine: 7, parentLine: null, markdown: null },
    });
    const filter: TaskRule = { mode: "and", conditions: [{ type: "tag", condition: "has", tags: ["#work"] }] };
    expect(matchesFilter(item, structure, filter)).toBe(true);
    expect(matchesFilter(other, structure, filter)).toBe(false);
  });

  it("drops a heading condition for a note item rather than failing or passing it", () => {
    const noteItem = buildTaskItem({ display: { kind: "note", path, title: "Ship it" } });
    // `and` must not exclude it, `or` must not carry it.
    expect(matchesFilter(noteItem, structure, under("## Tasks"))).toBe(true);
    expect(
      matchesFilter(noteItem, structure, {
        mode: "or",
        conditions: [
          { type: "heading", condition: "under", headings: ["## Tasks"] },
          { type: "status", condition: "is", statuses: ["done"] },
        ],
      }),
    ).toBe(false);
  });

  it("matches everything when every condition dropped out", () => {
    const noteItem = buildTaskItem({ display: { kind: "note", path, title: "Ship it" } });
    expect(matchesFilter(noteItem, structure, under("## Tasks"))).toBe(true);
  });
});

describe("composeFilters", () => {
  it("ands a journal's conditions into the query's", () => {
    const composed = composeFilters(under("## Tasks"), {
      mode: "and",
      conditions: [{ type: "status", condition: "is", statuses: ["open"] }],
    });
    expect(composed.conditions).toHaveLength(2);
  });

  it("lets a query condition replace the journal's of the same type, not merely narrow it", () => {
    const composed = composeFilters(under("## Tasks"), under("## Log"));
    expect(composed.conditions).toEqual([{ type: "heading", condition: "under", headings: ["## Log"] }]);
  });

  it("returns the query's filter unchanged for a note no journal owns", () => {
    const query = under("## Log");
    expect(composeFilters(null, query)).toEqual(query);
  });
});
