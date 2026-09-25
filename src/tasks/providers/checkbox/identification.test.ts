import { describe, expect, it } from "vitest";

import type { NoteStructure, StructureListItem } from "@/infrastructure/host";

import { identifies } from "./identification";

const item: StructureListItem = { marker: " ", line: 5, endLine: 5 };
const structure: NoteStructure = {
  listItems: [item],
  tags: [{ tag: "#task", line: 5 }],
  headings: [{ heading: "Tasks", level: 2, line: 3 }],
  frontmatterTags: [],
};
const empty = { mode: "and" as const, conditions: [] };
const tagged = {
  mode: "and" as const,
  conditions: [{ type: "tag" as const, condition: "has" as const, tags: ["#task"] }],
};
const otherTag = {
  mode: "and" as const,
  conditions: [{ type: "tag" as const, condition: "has" as const, tags: ["#habit"] }],
};
const underTasks = {
  compose: "narrow" as const,
  mode: "and" as const,
  conditions: [{ type: "heading" as const, condition: "under" as const, headings: ["Tasks"] }],
};

describe("identifies", () => {
  it("treats an empty vault rule as no constraint", () => {
    expect(identifies(item, { structure, vault: empty, journal: null })).toBe(true);
  });
  it("matches an inline tag on the item's own line", () => {
    expect(identifies(item, { structure, vault: tagged, journal: null })).toBe(true);
    expect(identifies(item, { structure, vault: otherTag, journal: null })).toBe(false);
  });
  it("matches a frontmatter tag for every item in the note", () => {
    const noteTagged = { ...structure, tags: [], frontmatterTags: ["#task"] };
    expect(identifies(item, { structure: noteTagged, vault: tagged, journal: null })).toBe(true);
  });
  it("does not let a nested child inherit its parent's tag", () => {
    const child: StructureListItem = { marker: " ", line: 6, endLine: 6 };
    const withChild = { ...structure, listItems: [item, child] };
    expect(identifies(child, { structure: withChild, vault: tagged, journal: null })).toBe(false);
  });
  it("narrows the vault rule with the journal's", () => {
    expect(identifies(item, { structure, vault: tagged, journal: underTasks })).toBe(true);
    const elsewhere: StructureListItem = { marker: " ", line: 2, endLine: 2 };
    const before = { ...structure, listItems: [elsewhere], tags: [{ tag: "#task", line: 2 }] };
    expect(identifies(elsewhere, { structure: before, vault: tagged, journal: underTasks })).toBe(false);
  });
  it("ignores the vault rule when the journal replaces it", () => {
    expect(identifies(item, { structure, vault: otherTag, journal: { ...underTasks, compose: "replace" } })).toBe(true);
  });
  it("uses the vault rule alone when the journal inherits", () => {
    expect(identifies(item, { structure, vault: otherTag, journal: { ...underTasks, compose: "inherit" } })).toBe(
      false,
    );
  });
  it("narrow fails when the vault rule fails, even if the journal's would pass", () => {
    // Distinguishes narrow (vault AND journal) from replace (journal alone): a vault miss
    // must sink the result even though the journal condition alone is satisfied.
    expect(identifies(item, { structure, vault: otherTag, journal: underTasks })).toBe(false);
  });
  it("inherit ignores the journal rule even when it would fail", () => {
    // Distinguishes inherit (vault alone) from narrow (vault AND journal): a journal
    // condition that would fail must not affect the result under inherit.
    const failingJournal = {
      compose: "inherit" as const,
      mode: "and" as const,
      conditions: [{ type: "heading" as const, condition: "under" as const, headings: ["Nonexistent"] }],
    };
    expect(identifies(item, { structure, vault: tagged, journal: failingJournal })).toBe(true);
  });
  it("combines conditions with or when asked", () => {
    const either = { mode: "or" as const, conditions: [...otherTag.conditions, ...tagged.conditions] };
    expect(identifies(item, { structure, vault: either, journal: null })).toBe(true);
  });
  it("supports negated conditions", () => {
    const lacks = {
      mode: "and" as const,
      conditions: [{ type: "tag" as const, condition: "lacks" as const, tags: ["#habit"] }],
    };
    expect(identifies(item, { structure, vault: lacks, journal: null })).toBe(true);
  });
  it("supports negated heading conditions", () => {
    const notUnderTasks = {
      mode: "and" as const,
      conditions: [{ type: "heading" as const, condition: "not-under" as const, headings: ["Tasks"] }],
    };
    const notUnderOther = {
      mode: "and" as const,
      conditions: [{ type: "heading" as const, condition: "not-under" as const, headings: ["Other"] }],
    };
    expect(identifies(item, { structure, vault: notUnderTasks, journal: null })).toBe(false);
    expect(identifies(item, { structure, vault: notUnderOther, journal: null })).toBe(true);
  });
  it("requires every condition to pass in and mode", () => {
    const mixed = {
      mode: "and" as const,
      conditions: [
        { type: "tag" as const, condition: "has" as const, tags: ["#task"] },
        { type: "tag" as const, condition: "has" as const, tags: ["#habit"] },
      ],
    };
    expect(identifies(item, { structure, vault: mixed, journal: null })).toBe(false);
  });
  it("walks the heading chain upward by strictly smaller level, skipping a same-level sibling", () => {
    const nested: NoteStructure = {
      listItems: [item],
      tags: [],
      headings: [
        { heading: "Tasks", level: 2, line: 1 },
        { heading: "Today", level: 3, line: 3 },
        { heading: "Later", level: 3, line: 4 },
      ],
      frontmatterTags: [],
    };
    const underTasksOnly = {
      mode: "and" as const,
      conditions: [{ type: "heading" as const, condition: "under" as const, headings: ["Tasks"] }],
    };
    const underLater = {
      mode: "and" as const,
      conditions: [{ type: "heading" as const, condition: "under" as const, headings: ["Later"] }],
    };
    const underToday = {
      mode: "and" as const,
      conditions: [{ type: "heading" as const, condition: "under" as const, headings: ["Today"] }],
    };
    expect(identifies(item, { structure: nested, vault: underLater, journal: null })).toBe(true);
    expect(identifies(item, { structure: nested, vault: underTasksOnly, journal: null })).toBe(true);
    expect(identifies(item, { structure: nested, vault: underToday, journal: null })).toBe(false);
  });
  // Status belongs to filtering, not identification — a status condition must never sink an
  // otherwise-matching rule, nor let an otherwise-empty rule start matching nothing.
  it("treats a status condition as a no-op, alone or alongside a real condition", () => {
    const statusOnly = {
      mode: "and" as const,
      conditions: [{ type: "status" as const, condition: "is" as const, statuses: ["done"] }],
    };
    expect(identifies(item, { structure, vault: statusOnly, journal: null })).toBe(true);
    const statusAndTag = {
      mode: "and" as const,
      conditions: [...statusOnly.conditions, ...otherTag.conditions],
    };
    expect(identifies(item, { structure, vault: statusAndTag, journal: null })).toBe(false);
  });
});
