import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { VaultPath } from "@/infrastructure/host";
import { journalConfigSchema, journalDefaultsFor } from "@/journals/config";
import { isUnreadable } from "@/settings/repair";
import { admitsSubject } from "@/tasks/visibility-rule/rule";

import { checkboxJournalRuleSchema, datedRuleOf, type CheckboxJournalRule } from "./rule-schema";

function readable(stored: unknown): CheckboxJournalRule {
  const rule = v.parse(checkboxJournalRuleSchema, stored);
  if (isUnreadable(rule)) throw new Error(`unreadable: ${JSON.stringify(rule)}`);
  return rule;
}

describe("checkboxJournalRuleSchema", () => {
  it("a journal rule keeps its identification when its dated rule is unreadable, and dates nothing", () => {
    const tag = { type: "tag", condition: "has", tags: ["#work"] };
    const parsed = readable({ compose: "narrow", conditions: [tag], dated: 5 });
    expect(parsed.compose).toBe("narrow");
    expect(parsed.conditions).toEqual([tag]);
    expect(parsed.dated).toEqual({ type: "unreadable", raw: 5 });
    expect(admitsSubject(parsed.dated, { path: "Work/a.md" as VaultPath, tags: [] })).toBe(false);
  });

  it("holds a rule whose relation or shape it cannot read whole, dating nothing", () => {
    const stored = { compose: "override", conditions: [] };
    const held = v.parse(checkboxJournalRuleSchema, stored);
    expect(held).toEqual({ type: "unreadable", raw: stored });
    expect(v.parse(checkboxJournalRuleSchema, "replace")).toEqual({ type: "unreadable", raw: "replace" });
    expect(admitsSubject(datedRuleOf(held), { path: "Work/a.md" as VaultPath, tags: [] })).toBe(false);
  });

  it("a journal with no checkbox entry reads as All", () => {
    const parsed = v.parse(journalConfigSchema, journalDefaultsFor({ type: "day" }, "Daily"));
    const rule = datedRuleOf(parsed.tasks.providers.checkbox);
    expect(rule).toBeUndefined();
    expect(admitsSubject(rule, { path: "Work/a.md" as VaultPath, tags: [] })).toBe(true);
  });

  it("a stored rule without a dated field reads as All", () => {
    const parsed = readable({ compose: "inherit", mode: "and", conditions: [] });
    expect(parsed.dated).toBeUndefined();
  });
});
