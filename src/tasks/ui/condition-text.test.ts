import { describe, expect, it } from "vitest";

import { conditionValues } from "./condition-text";

describe("conditionValues", () => {
  it("splits on commas and drops blank entries", () => {
    expect(conditionValues("#a, , #b ,", "tag")).toEqual(["#a", "#b"]);
  });

  // metadataCache spells tags with the "#" and headings without it, and identifies() compares by
  // exact equality — so the spelling a user naturally reaches for matches nothing at all.
  it("adds the leading # a tag needs to match metadataCache", () => {
    expect(conditionValues("task, #habit,  Work", "tag")).toEqual(["#task", "#habit", "#Work"]);
  });

  it("collapses repeated leading # on a tag rather than stacking them", () => {
    expect(conditionValues("##task", "tag")).toEqual(["#task"]);
  });

  it("strips the markdown # a heading must not carry", () => {
    expect(conditionValues("## Work, Personal", "heading")).toEqual(["Work", "Personal"]);
  });

  it("drops an entry that is nothing but # marks", () => {
    expect(conditionValues("#, ##", "tag")).toEqual([]);
    expect(conditionValues("#, ##", "heading")).toEqual([]);
  });
});
