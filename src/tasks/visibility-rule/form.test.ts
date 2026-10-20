import { describe, expect, it } from "vitest";

import { m } from "@/i18n";

import { emptyCondition, visibilityDraftFrom, visibilityFormErrors, visibilityFrom } from "./form";

import type { VisibilityRule } from "./rule";

describe("visibility form", () => {
  it("round-trips a stored rule unchanged", () => {
    const rule: VisibilityRule = {
      show: "matching",
      mode: "or",
      conditions: [
        { type: "tag", tags: ["#work", "#home"] },
        { type: "folder", folders: ["Projects"] },
        { type: "property", name: "projects", values: ["[[Website]]", "Shop, North"] },
      ],
    };
    expect(visibilityFrom(visibilityDraftFrom(rule))).toEqual(rule);
  });

  it("shares no array with the stored rule", () => {
    const rule: VisibilityRule = { show: "matching", mode: "and", conditions: [{ type: "folder", folders: ["A"] }] };
    const draft = visibilityDraftFrom(rule);
    const condition = draft.conditions.at(0);
    if (condition?.type !== "folder") throw new Error("no folder condition");
    condition.folders.push("B");
    expect(rule.conditions).toEqual([{ type: "folder", folders: ["A"] }]);
  });

  it("writes nothing for an untouched journal", () => {
    expect(visibilityFrom(visibilityDraftFrom(undefined))).toBeUndefined();
  });

  it("normalizes tags to their # form and drops blank entries", () => {
    const draft = visibilityDraftFrom(undefined);
    draft.show = "matching";
    draft.conditions.push({ ...emptyCondition("tag"), tags: "work, , #, ##home" } as never);
    expect(visibilityFrom(draft)?.conditions).toEqual([{ type: "tag", tags: ["#work", "#home"] }]);
  });

  it("refuses a tag condition whose entries are all blank", () => {
    const draft = visibilityDraftFrom(undefined);
    draft.show = "matching";
    const condition = { ...emptyCondition("tag"), tags: " , #" } as never as { id: number };
    draft.conditions.push(condition as never);
    expect(visibilityFormErrors(draft).get(condition.id)).toEqual([m.tasks_condition_values_required()]);
  });

  // Vault paths are relative, so a leading "/" would never match; "/" alone is the root.
  it("strips a folder's leading and trailing slashes and drops the root", () => {
    const draft = visibilityDraftFrom(undefined);
    draft.show = "matching";
    draft.conditions.push({ ...emptyCondition("folder"), folders: ["/Projects/", "/", " Areas "] } as never);
    expect(visibilityFrom(draft)?.conditions).toEqual([{ type: "folder", folders: ["Projects", "Areas"] }]);
  });

  it("refuses a property condition with no name or no value", () => {
    const draft = visibilityDraftFrom(undefined);
    draft.show = "matching";
    const blank = emptyCondition("property");
    draft.conditions.push(blank);
    expect(visibilityFormErrors(draft).get(blank.id)).toEqual([
      m.tasks_note_property_property_required(),
      m.tasks_condition_values_required(),
    ]);
  });

  it("refuses a property condition whose name is only whitespace", () => {
    const draft = visibilityDraftFrom(undefined);
    draft.show = "matching";
    const condition = { ...emptyCondition("property"), name: "  ", values: ["Website"] };
    draft.conditions.push(condition);
    expect(visibilityFormErrors(draft).get(condition.id)).toEqual([m.tasks_note_property_property_required()]);
  });

  it("validates conditions only under Matching, and drops unfinished ones elsewhere", () => {
    const draft = visibilityDraftFrom(undefined);
    draft.show = "none";
    draft.conditions.push(emptyCondition("property"), { ...emptyCondition("tag"), tags: "work" } as never);
    expect(visibilityFormErrors(draft).size).toBe(0);
    expect(visibilityFrom(draft)).toEqual({
      show: "none",
      mode: "and",
      conditions: [{ type: "tag", tags: ["#work"] }],
    });
  });
});
