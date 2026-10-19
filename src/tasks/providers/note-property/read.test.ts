import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { VaultPath } from "@/infrastructure/host";

import { identifiesNote, isRecurring, readDates, readStatus, readTitle } from "./read";
import { notePropertySliceSchema, type NotePropertySliceState } from "./slice";

const defaults = v.parse(notePropertySliceSchema, {});
const path = "Tasks/Buy milk.md" as VaultPath;

function state(patch: Partial<NotePropertySliceState> = {}): NotePropertySliceState {
  return { ...defaults, ...patch };
}

function meta(frontmatterTags: string[], properties: Record<string, unknown> = {}) {
  return { frontmatterTags, properties };
}

describe("identifiesNote", () => {
  it("matches the tag rule against the note's frontmatter tags", () => {
    expect(identifiesNote(meta(["#task"], { tags: ["task"] }), path, state())).toBe(true);
    expect(identifiesNote(meta(["#note"]), path, state())).toBe(false);
  });
  it("rejects a note under an excluded folder", () => {
    const s = state({ excludedFolders: ["Templates"] });
    expect(identifiesNote(meta(["#task"]), "Templates/Task.md" as VaultPath, s)).toBe(false);
    expect(identifiesNote(meta(["#task"]), "TemplatesOther/Task.md" as VaultPath, s)).toBe(true);
  });
  it("rejects a note carrying the archive tag, unless the archive tag is empty", () => {
    expect(identifiesNote(meta(["#task", "#archived"]), path, state())).toBe(false);
    expect(identifiesNote(meta(["#task", "#archived"]), path, state({ archiveTag: "" }))).toBe(true);
  });
  it("matches a nested tag under the task tag, never a longer tag that only starts the same", () => {
    expect(identifiesNote(meta(["#task/work"]), path, state())).toBe(true);
    expect(identifiesNote(meta(["#Task/Work"]), path, state())).toBe(true);
    expect(identifiesNote(meta(["#taskforce"]), path, state())).toBe(false);
  });
  it("rejects a note carrying a tag nested under the archive tag", () => {
    expect(identifiesNote(meta(["#task", "#archived/2025"]), path, state())).toBe(false);
    expect(identifiesNote(meta(["#task", "#archived-later"]), path, state())).toBe(true);
  });
  it("matches a property rule with an empty value on presence alone", () => {
    const s = state({ identify: { by: "property", name: "due", value: "" } });
    expect(identifiesNote(meta([], { due: "x" }), path, s)).toBe(true);
    expect(identifiesNote(meta([], {}), path, s)).toBe(false);
  });
  it("matches a property rule with an empty value whatever the property holds, empty included", () => {
    const s = state({ identify: { by: "property", name: "isTask", value: "" } });
    expect(identifiesNote(meta([], { isTask: null }), path, s)).toBe(true);
    expect(identifiesNote(meta([], { isTask: "" }), path, s)).toBe(true);
    expect(identifiesNote(meta([], { other: "x" }), path, s)).toBe(false);
  });
  it("rejects an empty property for a rule that names a value", () => {
    const s = state({ identify: { by: "property", name: "isTask", value: "true" } });
    expect(identifiesNote(meta([], { isTask: null }), path, s)).toBe(false);
  });
  it("matches a property rule by value, scalar or list", () => {
    const s = state({ identify: { by: "property", name: "type", value: "task" } });
    expect(identifiesNote(meta([], { type: "task" }), path, s)).toBe(true);
    expect(identifiesNote(meta([], { type: ["task"] }), path, s)).toBe(true);
    expect(identifiesNote(meta([], { type: "note" }), path, s)).toBe(false);
  });
  it("matches a YAML boolean or number against the rule value's text", () => {
    const flag = state({ identify: { by: "property", name: "isTask", value: "true" } });
    expect(identifiesNote(meta([], { isTask: true }), path, flag)).toBe(true);
    expect(identifiesNote(meta([], { isTask: false }), path, flag)).toBe(false);
    const numbered = state({ identify: { by: "property", name: "type", value: "1" } });
    expect(identifiesNote(meta([], { type: 1 }), path, numbered)).toBe(true);
  });
  it("matches a boolean list item against the rule value's text", () => {
    const s = state({ identify: { by: "property", name: "flags", value: "TRUE" } });
    expect(identifiesNote(meta([], { flags: ["x", true] }), path, s)).toBe(true);
  });
});

describe("readDates", () => {
  const dates = { due: "due", scheduled: "scheduled" };
  it("reads an ISO date", () => {
    expect(readDates({ due: "2026-10-21" }, dates)).toEqual({ due: "2026-10-21" });
  });
  it("drops the time part", () => {
    expect(readDates({ due: "2026-10-21T14:00" }, dates)).toEqual({ due: "2026-10-21" });
  });
  it("leaves the role absent for a value it cannot read", () => {
    expect(readDates({ due: "not a date" }, dates)).toEqual({});
    expect(readDates({ due: ["2026-10-21"] }, dates)).toEqual({});
    expect(readDates({ due: 20_261_021 }, dates)).toEqual({});
    expect(readDates({ due: "2026-13-45" }, dates)).toEqual({});
  });
  it("ignores a role with no mapped property", () => {
    expect(readDates({ due: "2026-10-21", scheduled: "2026-10-22" }, { due: "due" })).toEqual({ due: "2026-10-21" });
  });
});

describe("readStatus", () => {
  it("matches case-insensitively", () => {
    expect(readStatus({ status: "Done" }, state())).toBe("done");
  });
  it("stringifies a YAML boolean before matching", () => {
    expect(readStatus({ status: true }, state({ statusMap: { true: "done" } }))).toBe("done");
  });
  it("falls back to todo when missing or unknown", () => {
    expect(readStatus({}, state())).toBe("todo");
    expect(readStatus({ status: "weird" }, state())).toBe("todo");
  });
  it("falls back to todo when the map names an unknown status", () => {
    expect(readStatus({ status: "x" }, state({ statusMap: { x: "bogus" } }))).toBe("todo");
  });
});

describe("readTitle", () => {
  it("prefers the mapped property", () => {
    expect(readTitle({ title: "Buy oat milk" }, path, "title")).toBe("Buy oat milk");
  });
  it("falls back to the basename when the property is empty or missing", () => {
    expect(readTitle({ title: "" }, path, "title")).toBe("Buy milk");
    expect(readTitle({}, path, "title")).toBe("Buy milk");
  });
});

describe("isRecurring", () => {
  const names = ["recurrence", "recurrence_parent"];
  it("is true when a listed property is non-empty", () => {
    expect(isRecurring({ recurrence: "FREQ=DAILY" }, names)).toBe(true);
    expect(isRecurring({ recurrence_parent: "[[x]]" }, names)).toBe(true);
  });
  it("is false when the property is empty or absent", () => {
    expect(isRecurring({ recurrence: "" }, names)).toBe(false);
    expect(isRecurring({}, names)).toBe(false);
  });
});
