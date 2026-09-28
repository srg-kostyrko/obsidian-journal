import * as v from "valibot";
import { describe, expect, it } from "vitest";

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

  it("falls back rather than failing on an unknown comparator, so one stale value cannot discard a rule", () => {
    expect(v.parse(taskConditionSchema, { type: "status", condition: "matches" })).toEqual({
      type: "status",
      condition: "is",
      statuses: [],
    });
  });

  it("defaults a rule to and-mode with no conditions", () => {
    expect(v.parse(taskRuleSchema, {})).toEqual({ mode: "and", conditions: [] });
  });
});
