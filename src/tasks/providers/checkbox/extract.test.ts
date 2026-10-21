import { describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import type { NoteStructure, VaultPath } from "@/infrastructure/host";

import { extractItems, lineDatesOf, lineStampOf } from "./extract";
import { DEFAULT_STATUS_MAP } from "./slice";

const path = "journal/2026-09-22.md" as VaultPath;
const structure: NoteStructure = {
  listItems: [
    { marker: " ", line: 4, endLine: 6, parent: null },
    { marker: "/", line: 5, endLine: 5, parent: null },
    { marker: "x", line: 6, endLine: 6, parent: null },
  ],
  tags: [],
  headings: [],
  frontmatterTags: [],
};
const base = {
  path,
  structure,
  vault: { mode: "and" as const, conditions: [] },
  journal: null,
  statusMap: DEFAULT_STATUS_MAP,
  owned: true,
  lineDates: undefined,
  rolledMarker: "#rolled",
};

describe("extractItems", () => {
  it("yields one item per marked list item, keyed by path and line", () => {
    const items = extractItems(base);
    expect(items).toHaveLength(3);
    expect(items.at(0)?.key).toBe(`${path}:4`);
    expect(items.map((i) => i.status)).toEqual(["todo", "in-progress", "done"]);
  });
  it("declares containment, movable and stampable, and retargetable false before hydration", () => {
    const item = extractItems(base).at(0);
    expect(item?.relations).toEqual(["containment"]);
    expect(item?.capabilities).toEqual({ movable: true, stampable: true, retargetable: false });
  });
  it("carries a line display whose markdown is null until hydrated, with a distinct endLine", () => {
    const item = extractItems(base).at(0);
    expect(item?.key).toBe(`${path}:4`);
    expect(item?.display).toEqual({
      kind: "line",
      path,
      line: 4,
      endLine: 6,
      parentLine: null,
      markdown: null,
    });
  });
  it("drops items the identification rule rejects", () => {
    const tagged = {
      ...base,
      vault: {
        mode: "and" as const,
        conditions: [{ type: "tag" as const, condition: "has" as const, tags: ["#task"] }],
      },
    };
    expect(extractItems(tagged)).toHaveLength(0);
  });
  it("returns nothing for a note with no list items", () => {
    expect(extractItems({ ...base, structure: { ...structure, listItems: [] } })).toHaveLength(0);
  });
  it("normalizes through the caller's statusMap, not the imported default", () => {
    const customMap = { ...DEFAULT_STATUS_MAP, " ": "done" };
    const items = extractItems({ ...base, statusMap: customMap });
    expect(items.at(0)?.status).toBe("done");
  });
  it("carries a nested item's parent line onto its display", () => {
    const items = extractItems({
      path: "Daily/2026-09-22.md" as VaultPath,
      structure: {
        listItems: [
          { marker: " ", line: 3, endLine: 3, parent: null },
          { marker: " ", line: 4, endLine: 4, parent: 3 },
        ],
        tags: [],
        headings: [],
        frontmatterTags: [],
      },
      vault: { mode: "and", conditions: [] },
      journal: null,
      statusMap: { " ": "todo" },
      owned: true,
      lineDates: undefined,
      rolledMarker: "#rolled",
    });
    expect(items.map((item) => item.display.kind === "line" && item.display.parentLine)).toEqual([null, 3]);
  });
  it("passes the journal rule through to identifies, changing the outcome from the vault rule alone", () => {
    const rejectsEverything = {
      mode: "and" as const,
      conditions: [{ type: "tag" as const, condition: "has" as const, tags: ["#task"] }],
    };
    const acceptsEverything = { compose: "replace" as const, mode: "and" as const, conditions: [] };
    expect(extractItems({ ...base, vault: rejectsEverything, journal: null })).toHaveLength(0);
    expect(extractItems({ ...base, vault: rejectsEverything, journal: acceptsEverything })).toHaveLength(3);
  });

  it("an owned note keeps undated items and adds the date relation to dated ones", () => {
    const lineDates = new Map([[4, { due: "2026-10-24" as AnchorString }]]);
    const items = extractItems({ ...base, lineDates });
    const dated = items.find((item) => item.key === `${path}:4`);
    const undated = items.find((item) => item.key === `${path}:5`);
    expect(dated?.relations).toEqual(["containment", "date"]);
    expect(dated?.dates.due).toBe("2026-10-24");
    expect(dated?.capabilities.retargetable).toBe(true);
    expect(undated?.relations).toEqual(["containment"]);
    expect(undated?.dates).toEqual({});
    expect(undated?.capabilities.retargetable).toBe(false);
  });
  it("a note no journal owns keeps only dated items, by date alone", () => {
    const lineDates = new Map([[4, { due: "2026-10-24" as AnchorString }]]);
    const items = extractItems({ ...base, owned: false, lineDates });
    expect(items).toHaveLength(1);
    expect(items.at(0)?.key).toBe(`${path}:4`);
    expect(items.at(0)?.relations).toEqual(["date"]);
    expect(items.at(0)?.dates).toEqual({ due: "2026-10-24" });
  });
  it("without line dates an owned note fills as before", () => {
    const items = extractItems(base);
    expect(items.map((item) => item.relations)).toEqual([["containment"], ["containment"], ["containment"]]);
    expect(items.map((item) => item.dates)).toEqual([{}, {}, {}]);
    expect(items.every((item) => !item.capabilities.retargetable)).toBe(true);
  });
  it("lineDatesOf reads each task item's own lines", () => {
    const text = ["# Plan", "- [ ] Parent", "  - [ ] Child 📅 2026-10-24", "- [ ] Sibling [due:: 2026-10-25]"].join(
      "\n",
    );
    const nested: NoteStructure = {
      ...structure,
      listItems: [
        { marker: " ", line: 1, endLine: 1, parent: null },
        { marker: " ", line: 2, endLine: 2, parent: 1 },
        { marker: " ", line: 3, endLine: 3, parent: null },
      ],
    };
    expect([...lineDatesOf(text, nested)]).toEqual([
      [2, { due: "2026-10-24" }],
      [3, { due: "2026-10-25" }],
    ]);
  });
  it("lineStampOf names every task item's line", () => {
    expect(lineStampOf(structure)).toBe("4,5,6");
  });
});

function item(marker: string, line: number, parent: number | null = null) {
  return { marker, line, endLine: line, parent };
}

function noteWith(overrides: Partial<NoteStructure>): NoteStructure {
  return {
    listItems: [item(" ", 2)],
    tags: [],
    headings: [],
    frontmatterTags: [],
    ...overrides,
  };
}

describe("rolled marker", () => {
  it("a line carrying the marker on its own line reads as rolled", () => {
    const items = extractItems({ ...base, structure: noteWith({ tags: [{ tag: "#rolled", line: 2 }] }) });
    expect(items.at(0)?.status).toBe("rolled");
  });
  it("matches the marker case-insensitively", () => {
    const items = extractItems({ ...base, structure: noteWith({ tags: [{ tag: "#Rolled", line: 2 }] }) });
    expect(items.at(0)?.status).toBe("rolled");
  });
  it("the marker on a child line does not make its parent rolled", () => {
    const structure = noteWith({
      listItems: [{ marker: " ", line: 2, endLine: 3, parent: null }, item(" ", 3, 2)],
      tags: [{ tag: "#rolled", line: 3 }],
    });
    const items = extractItems({ ...base, structure });
    expect(items.map((i) => i.status)).toEqual(["todo", "rolled"]);
  });
  it("an item under a stamped ancestor reads as rolled, one under an unstamped sibling root does not", () => {
    const structure = noteWith({
      listItems: [item(" ", 2), item(" ", 3, 2), item("x", 4, 3), item(" ", 5), item(" ", 6, 5)],
      tags: [{ tag: "#rolled", line: 2 }],
    });
    const items = extractItems({ ...base, structure });
    expect(items.map((i) => i.status)).toEqual(["rolled", "rolled", "rolled", "todo", "todo"]);
  });
  it("a stamped non-task parent makes its task children rolled", () => {
    const structure = noteWith({
      listItems: [item(" ", 3, 2), item(" ", 5, 4)],
      tags: [{ tag: "#rolled", line: 2 }],
    });
    expect(extractItems({ ...base, structure }).map((i) => i.status)).toEqual(["rolled", "todo"]);
  });
  it("an ancestor's marker rolls nothing when the marker is empty", () => {
    const structure = noteWith({
      listItems: [item(" ", 2), item(" ", 3, 2)],
      tags: [{ tag: "#rolled", line: 2 }],
    });
    expect(extractItems({ ...base, rolledMarker: "", structure }).map((i) => i.status)).toEqual(["todo", "todo"]);
  });
  it("a frontmatter tag equal to the marker rolls nothing", () => {
    const items = extractItems({ ...base, structure: noteWith({ frontmatterTags: ["rolled"] }) });
    expect(items.at(0)?.status).toBe("todo");
  });
  it("a done line carrying the marker still reads as rolled", () => {
    const items = extractItems({
      ...base,
      structure: noteWith({ listItems: [item("x", 2)], tags: [{ tag: "#rolled", line: 2 }] }),
    });
    expect(items.at(0)?.status).toBe("rolled");
  });
  it("an empty marker rolls nothing", () => {
    const items = extractItems({
      ...base,
      rolledMarker: "",
      structure: noteWith({ tags: [{ tag: "#rolled", line: 2 }] }),
    });
    expect(items.at(0)?.status).toBe("todo");
  });
});
