import { describe, expect, it } from "vitest";

import { m } from "@/i18n";

import { describeVisibility as describe_ } from "./describe";

const wording = {
  all: m.tasks_note_visibility_summary_all,
  none: m.tasks_note_visibility_summary_none,
  matching: m.tasks_note_visibility_summary_matching,
};
const describeVisibility = (rule: Parameters<typeof describe_>[0]) => describe_(rule, wording);

const tag = m.tasks_note_visibility_condition_tag({ tags: "#work" });
const folder = m.tasks_note_visibility_condition_folder({ folders: "Projects" });

describe("describeVisibility", () => {
  it("reads an absent rule and All as every task note", () => {
    expect(describeVisibility(undefined)).toBe(m.tasks_note_visibility_summary_all());
    expect(describeVisibility({ show: "all", mode: "and", conditions: [{ type: "tag", tags: ["#work"] }] })).toBe(
      m.tasks_note_visibility_summary_all(),
    );
  });

  it("reads None as no task notes", () => {
    expect(describeVisibility({ show: "none", mode: "and", conditions: [] })).toBe(
      m.tasks_note_visibility_summary_none(),
    );
  });

  // Matching with nothing to compare narrows nothing (visibility.ts), so it must not read as a filter.
  it("reads Matching with only empty conditions as every task note", () => {
    expect(describeVisibility({ show: "matching", mode: "and", conditions: [{ type: "tag", tags: [] }] })).toBe(
      m.tasks_note_visibility_summary_all(),
    );
  });

  it("joins conditions by the rule's mode", () => {
    const conditions = [
      { type: "tag" as const, tags: ["#work"] },
      { type: "folder" as const, folders: ["Projects"] },
    ];
    const and = describeVisibility({ show: "matching", mode: "and", conditions });
    const or = describeVisibility({ show: "matching", mode: "or", conditions });
    expect(and).toContain(tag);
    expect(and).toContain(folder);
    expect(and).not.toBe(or);
  });

  it("names a property condition's property and values", () => {
    const text = describeVisibility({
      show: "matching",
      mode: "and",
      conditions: [{ type: "property", name: "projects", values: ["[[Website]]"] }],
    });
    expect(text).toBe(
      m.tasks_note_visibility_summary_matching({
        conditions: m.tasks_note_visibility_condition_property({ property: "projects", values: "[[Website]]" }),
      }),
    );
  });
});
