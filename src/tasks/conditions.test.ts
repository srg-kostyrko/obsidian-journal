import * as v from "valibot";
import { describe, expect, it } from "vitest";
import { reactive } from "vue";

import { unwrapUnreadable } from "@/settings/repair";

import { taskConditionSchema, taskRuleSchema } from "./conditions";

describe("taskConditionSchema", () => {
  it("defaults a status condition to `is` with no statuses named", () => {
    expect(v.parse(taskConditionSchema, { type: "status" })).toEqual({
      type: "status",
      condition: "is",
      statuses: [],
    });
  });

  it("keeps the tag and heading arms #502 shipped", () => {
    expect(v.parse(taskConditionSchema, { type: "tag", condition: "lacks", tags: ["#w"] })).toEqual({
      type: "tag",
      condition: "lacks",
      tags: ["#w"],
    });
    expect(v.parse(taskConditionSchema, { type: "heading", headings: ["## Tasks"] })).toEqual({
      type: "heading",
      condition: "under",
      headings: ["## Tasks"],
    });
  });

  it("rejects an unknown comparator rather than reading it as another one", () => {
    expect(v.safeParse(taskConditionSchema, { type: "tag", condition: "lack", tags: ["#w"] }).success).toBe(false);
    expect(v.safeParse(taskConditionSchema, { type: "heading", condition: "below" }).success).toBe(false);
  });
  it("defaults a rule to and-mode with no conditions", () => {
    expect(v.parse(taskRuleSchema, {})).toEqual({ mode: "and", conditions: [] });
  });

  it("keeps a stored condition it cannot read as unreadable, holding what was stored", () => {
    const stored = { type: "tag", condition: "lack", tags: ["#w"] };
    expect(v.parse(taskRuleSchema, { conditions: [stored, { type: "status" }] }).conditions).toEqual([
      { type: "unreadable", raw: stored },
      { type: "status", condition: "is", statuses: [] },
    ]);
  });

  it("reads an unreadable condition back unchanged, so saving it keeps what was stored", () => {
    const unreadable = { type: "unreadable", raw: { type: "priority", above: 2 } };
    expect(v.parse(taskRuleSchema, { conditions: [unreadable] }).conditions).toEqual([unreadable]);
  });

  it("reads a stored condition list that is not a list as one unreadable condition", () => {
    expect(v.parse(taskRuleSchema, { conditions: "tag: #w" }).conditions).toEqual([
      { type: "unreadable", raw: "tag: #w" },
    ]);
  });

  // Saved through the settings store's reactive proxy, the way every settings write is.
  it("writes a stored condition list that is not a list back as it was stored", () => {
    const stored = { mode: "or", conditions: "tag: #w" };
    const held = reactive(v.parse(taskRuleSchema, stored));

    expect(JSON.parse(JSON.stringify(held, unwrapUnreadable))).toEqual(stored);
  });
});
