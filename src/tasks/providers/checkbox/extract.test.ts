import { describe, expect, it } from "vitest";

import type { NoteStructure, VaultPath } from "@/infrastructure/host";

import { extractItems } from "./extract";
import { DEFAULT_STATUS_MAP } from "./slice";

const path = "journal/2026-09-22.md" as VaultPath;
const structure: NoteStructure = {
  listItems: [
    { marker: " ", line: 4, endLine: 6 },
    { marker: "/", line: 5, endLine: 5 },
    { marker: "x", line: 6, endLine: 6 },
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
    expect(item?.display).toEqual({ kind: "line", path, line: 4, endLine: 6, markdown: null });
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
  it("passes the journal rule through to identifies, changing the outcome from the vault rule alone", () => {
    const rejectsEverything = {
      mode: "and" as const,
      conditions: [{ type: "tag" as const, condition: "has" as const, tags: ["#task"] }],
    };
    const acceptsEverything = { compose: "replace" as const, mode: "and" as const, conditions: [] };
    expect(extractItems({ ...base, vault: rejectsEverything, journal: null })).toHaveLength(0);
    expect(extractItems({ ...base, vault: rejectsEverything, journal: acceptsEverything })).toHaveLength(3);
  });
});
