import { describe, expect, it } from "vitest";

import { describeCheckboxRule, describeJournalRule } from "./describe-rule";

describe("describeCheckboxRule", () => {
  it("says every checkbox item is a task when there are no conditions", () => {
    expect(describeCheckboxRule({ mode: "and", conditions: [] })).toBe(
      "No conditions — every checkbox item in a journal's notes is a task.",
    );
  });

  it("describes a single tag condition", () => {
    expect(
      describeCheckboxRule({ mode: "and", conditions: [{ type: "tag", condition: "has", tags: ["#task"] }] }),
    ).toBe("Counts a checkbox item that is tagged #task.");
  });

  it("joins conditions with and under the all-conditions mode", () => {
    const text = describeCheckboxRule({
      mode: "and",
      conditions: [
        { type: "tag", condition: "has", tags: ["#task"] },
        { type: "heading", condition: "under", headings: ["Work"] },
      ],
    });
    expect(text).toContain("and");
    expect(text).toContain("#task");
    expect(text).toContain("Work");
  });

  // formatConjunction/-Disjunction, never a hardcoded word: the separator and its placement
  // vary by locale and item count.
  it("joins conditions with or under the any-condition mode", () => {
    const text = describeCheckboxRule({
      mode: "or",
      conditions: [
        { type: "tag", condition: "has", tags: ["#task"] },
        { type: "heading", condition: "under", headings: ["Work"] },
      ],
    });
    expect(text).toContain("or");
    expect(text).not.toContain("and");
  });

  it("lists every tag a condition names", () => {
    const text = describeCheckboxRule({
      mode: "and",
      conditions: [{ type: "tag", condition: "lacks", tags: ["#a", "#b"] }],
    });
    expect(text).toContain("#a");
    expect(text).toContain("#b");
  });
});

describe("describeJournalRule", () => {
  it("reports inheritance when the journal has no rule of its own", () => {
    expect(describeJournalRule(undefined)).toBe("Inherits the vault-wide rule.");
  });

  it("reports inheritance for an explicit inherit rule", () => {
    expect(describeJournalRule({ compose: "inherit", mode: "and", conditions: [] })).toBe(
      "Inherits the vault-wide rule.",
    );
  });

  it("names narrowing and the rule that narrows", () => {
    const text = describeJournalRule({
      compose: "narrow",
      mode: "and",
      conditions: [{ type: "heading", condition: "under", headings: ["Work"] }],
    });
    expect(text).toContain("Narrows");
    expect(text).toContain("Work");
  });

  it("names replacement and the replacing rule", () => {
    const text = describeJournalRule({
      compose: "replace",
      mode: "and",
      conditions: [{ type: "tag", condition: "has", tags: ["#task"] }],
    });
    expect(text).toContain("Replaces");
    expect(text).toContain("#task");
  });
});
