import { describe, expect, it } from "vitest";

import type { NoteStructure, VaultPath } from "@/infrastructure/host";

import { composeDatedFilter, composeFilters, matchesFilter } from "./filter";
import { buildTaskItem } from "./testing";

import type { TaskCondition, TaskRule } from "./conditions";

const path = "Daily/2026-09-22.md" as VaultPath;

// Headings carry no "#": Obsidian's own HeadingCache.heading is the heading's text with its ATX
// marker already stripped, and both spellings a user can reach for are normalized to that before a
// condition is ever stored or compared (normalizeHeading in tasks-config.ts, conditionValues in
// condition-text.ts). A fixture spelling one "## Tasks" certifies a match no real vault produces.
const structure: NoteStructure = {
  listItems: [
    { marker: " ", line: 3, endLine: 3, parent: null },
    { marker: " ", line: 7, endLine: 7, parent: null },
  ],
  tags: [{ tag: "#work", line: 3 }],
  headings: [
    { heading: "Tasks", level: 2, line: 1 },
    { heading: "Log", level: 2, line: 5 },
  ],
  frontmatterTags: [],
};

const under = (heading: string): TaskRule => ({
  mode: "and",
  conditions: [{ type: "heading", condition: "under", headings: [heading] }],
});

// A note-property item, tagged by the frontmatter it was published with.
const noteItem = (frontmatterTags: string[]) =>
  buildTaskItem({ display: { kind: "note", path, title: "Ship it" }, facts: { tags: frontmatterTags } });

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
    expect(matchesFilter(item, structure, under("Tasks"))).toBe(true);
    expect(matchesFilter(item, structure, under("Log"))).toBe(false);
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
    expect(matchesFilter(noteItem, structure, under("Tasks"))).toBe(true);
    expect(
      matchesFilter(noteItem, structure, {
        mode: "or",
        conditions: [
          { type: "heading", condition: "under", headings: ["Tasks"] },
          { type: "status", condition: "is", statuses: ["done"] },
        ],
      }),
    ).toBe(false);
  });

  it("matches a tag on a note item against the frontmatter tags the item carries", () => {
    const filter: TaskRule = { mode: "and", conditions: [{ type: "tag", condition: "has", tags: ["#work"] }] };
    // The inline #work on line 3 belongs to that line, not to the note.
    expect(matchesFilter(noteItem(["#task"]), structure, filter)).toBe(false);
    expect(matchesFilter(noteItem(["#task", "#work"]), structure, filter)).toBe(true);
    expect(matchesFilter(noteItem(["#task", "#work"]), undefined, filter)).toBe(true);
    // The live structure is not consulted: the item's own snapshot decides.
    expect(matchesFilter(noteItem(["#task"]), { ...structure, frontmatterTags: ["#work"] }, filter)).toBe(false);
    expect(
      matchesFilter(noteItem(["#work"]), structure, {
        ...filter,
        conditions: [{ type: "tag", condition: "lacks", tags: ["#work"] }],
      }),
    ).toBe(false);
  });

  it("drops a tag condition for a note item that carries no tags of its own", () => {
    const untagged = buildTaskItem({ display: { kind: "note", path, title: "Ship it" } });
    const filter: TaskRule = { mode: "and", conditions: [{ type: "tag", condition: "has", tags: ["#work"] }] };
    expect(matchesFilter(untagged, { ...structure, frontmatterTags: ["#work"] }, filter)).toBe(true);
    expect(matchesFilter(untagged, structure, filter)).toBe(true);
  });

  it("treats an unresolved metadataCache (structure undefined) as no constraint, not a mismatch", () => {
    const item = buildTaskItem({
      display: { kind: "line", path, line: 3, endLine: 3, parentLine: null, markdown: null },
    });
    expect(matchesFilter(item, undefined, under("Tasks"))).toBe(true);
  });

  it("does not let a heading condition dropped for a cold cache carry an `or` match", () => {
    const item = buildTaskItem({
      display: { kind: "line", path, line: 3, endLine: 3, parentLine: null, markdown: null },
      status: "done",
    });
    expect(
      matchesFilter(item, undefined, {
        mode: "or",
        conditions: [
          { type: "heading", condition: "under", headings: ["Tasks"] },
          { type: "status", condition: "is", statuses: ["todo"] },
        ],
      }),
    ).toBe(false);
  });
});

describe("composeFilters", () => {
  it("ands a journal's conditions into the query's", () => {
    const composed = composeFilters(under("Tasks"), {
      mode: "and",
      conditions: [{ type: "status", condition: "is", statuses: ["open"] }],
    });
    expect(composed.conditions).toHaveLength(2);
  });

  it("lets a query condition replace the journal's of the same type, not merely narrow it", () => {
    const composed = composeFilters(under("Tasks"), under("Log"));
    expect(composed.conditions.filter((condition) => condition.type === "heading")).toEqual([
      { type: "heading", condition: "under", headings: ["Log"] },
    ]);
  });

  it("carries the query's own conditions through for a note no journal owns", () => {
    const composed = composeFilters(null, under("Log"));
    expect(composed.conditions).toContainEqual({ type: "heading", condition: "under", headings: ["Log"] });
  });

  // A journal contributes conditions, never a combinator: one flat list has one mode, and nesting
  // is ruled out by design, so there is no composition that could honour two. The surface's filter
  // is the one that IS the query, which is why the journal's own editor offers no mode control
  // (EditTaskFilterModal's `showMode`) while the view block's keeps it.
  it("takes the query's mode, never the journal's", () => {
    const journal: TaskRule = {
      mode: "or",
      conditions: [{ type: "heading", condition: "under", headings: ["Tasks"] }],
    };
    const tag: TaskCondition = { type: "tag", condition: "has", tags: ["#work"] };
    expect(composeFilters(journal, { mode: "and", conditions: [tag] }).mode).toBe("and");
    expect(composeFilters(journal, { mode: "or", conditions: [tag] }).mode).toBe("or");
  });

  // The listing's status default applies here, after composition, rather than being emitted into a
  // surface's own query up front: emitted up front it is a query condition, and replace-by-type
  // then overrides the journal's status condition on every surface — so a journal saying "show all
  // statuses" could never reach a bare fence. A filter naming no status behaves exactly as one whose
  // status condition is Open, whichever side named the rest.
  it("defaults to open when neither the journal nor the query names a status", () => {
    expect(composeFilters(null, { mode: "and", conditions: [] }).conditions).toEqual([
      { type: "status", condition: "is", statuses: ["open"] },
    ]);
    expect(composeFilters(under("Tasks"), { mode: "and", conditions: [] }).conditions).toEqual([
      { type: "heading", condition: "under", headings: ["Tasks"] },
      { type: "status", condition: "is", statuses: ["open"] },
    ]);
  });

  it("leaves the journal's status condition alone when the query names none", () => {
    const journal: TaskRule = { mode: "and", conditions: [{ type: "status", condition: "is", statuses: ["all"] }] };
    expect(composeFilters(journal, { mode: "and", conditions: [] }).conditions).toEqual([
      { type: "status", condition: "is", statuses: ["all"] },
    ]);
  });

  it("does not add the default over a status the query named itself", () => {
    const journal: TaskRule = { mode: "and", conditions: [{ type: "status", condition: "is", statuses: ["all"] }] };
    const query: TaskRule = { mode: "and", conditions: [{ type: "status", condition: "is", statuses: ["done"] }] };
    expect(composeFilters(journal, query).conditions).toEqual([
      { type: "status", condition: "is", statuses: ["done"] },
    ]);
  });
});

describe("composeDatedFilter", () => {
  const journal: TaskRule = {
    mode: "and",
    conditions: [
      { type: "tag", condition: "has", tags: ["#work"] },
      { type: "heading", condition: "under", headings: ["Tasks"] },
      { type: "status", condition: "is", statuses: ["done"] },
    ],
  };

  it("takes only the journal's status conditions", () => {
    expect(composeDatedFilter(journal, { mode: "and", conditions: [] }).conditions).toEqual([
      { type: "status", condition: "is", statuses: ["done"] },
    ]);
  });

  it("keeps every condition the surface names, tag and heading included", () => {
    const tag: TaskCondition = { type: "tag", condition: "has", tags: ["#home"] };
    expect(composeDatedFilter(journal, { mode: "or", conditions: [tag] })).toEqual({
      mode: "or",
      conditions: [{ type: "status", condition: "is", statuses: ["done"] }, tag],
    });
  });

  it("falls back to the listing's open default when neither side names a status", () => {
    expect(composeDatedFilter(under("Tasks"), { mode: "and", conditions: [] }).conditions).toEqual([
      { type: "status", condition: "is", statuses: ["open"] },
    ]);
    expect(composeDatedFilter(null, { mode: "and", conditions: [] }).conditions).toEqual([
      { type: "status", condition: "is", statuses: ["open"] },
    ]);
  });
});
