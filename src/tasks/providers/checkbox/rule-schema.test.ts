import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { VaultPath } from "@/infrastructure/host";
import { journalConfigSchema, journalDefaultsFor } from "@/journals/config";
import { admitsSubject } from "@/tasks/visibility-rule/rule";

import { checkboxJournalRuleSchema } from "./rule-schema";

describe("checkboxJournalRuleSchema", () => {
  it("a journal rule keeps its identification when its dated rule is malformed", () => {
    const tag = { type: "tag", condition: "has", tags: ["#work"] };
    const parsed = v.parse(checkboxJournalRuleSchema, { compose: "narrow", conditions: [tag], dated: 5 });
    expect(parsed.compose).toBe("narrow");
    expect(parsed.conditions).toEqual([tag]);
    expect(parsed.dated).toBeUndefined();
  });

  it("a journal with no checkbox entry reads as All", () => {
    const parsed = v.parse(journalConfigSchema, journalDefaultsFor({ type: "day" }, "Daily"));
    const rule = parsed.tasks.providers.checkbox?.dated;
    expect(rule).toBeUndefined();
    expect(admitsSubject(rule, { path: "Work/a.md" as VaultPath, tags: [] })).toBe(true);
  });

  it("a stored rule without a dated field reads as All", () => {
    const parsed = v.parse(checkboxJournalRuleSchema, { compose: "inherit", mode: "and", conditions: [] });
    expect(parsed.dated).toBeUndefined();
  });
});
