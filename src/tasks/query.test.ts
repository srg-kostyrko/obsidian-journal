import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { DEFAULT_TASK_QUERY, taskQuerySchema } from "./query";

describe("taskQuerySchema", () => {
  // No status condition, deliberately: every surface that stores a query stores this default, and a
  // status stored here would replace the owning journal's own (composeFilters). The open-only
  // reading a bare query still gets comes from there instead.
  it("defaults a bare query to both sources, this period, no conditions, document order", () => {
    expect(v.parse(taskQuerySchema, {})).toEqual(DEFAULT_TASK_QUERY);
    expect(DEFAULT_TASK_QUERY).toEqual({
      scope: { provider: [], source: "both", depth: "literal" },
      filter: { mode: "and", conditions: [] },
      sort: "document",
      date: "scheduled-or-due",
    });
  });

  it("keeps an explicit empty filter, so `status: all` is expressible as no constraint", () => {
    const parsed = v.parse(taskQuerySchema, { filter: { mode: "and", conditions: [] } });
    expect(parsed.filter.conditions).toEqual([]);
  });

  // An unreadable value is the read-time repair's to reset, so it reaches the log rather than
  // being swapped silently here.
  it.each([
    ["sort", { sort: "priority" }],
    ["date", { date: "whenever" }],
    ["scope.source", { scope: { source: "vault" } }],
    ["scope.depth", { scope: { depth: "deep" } }],
    ["filter.mode", { filter: { mode: "xor" } }],
  ])("rejects an unknown %s", (_field, raw) => {
    expect(v.safeParse(taskQuerySchema, raw).success).toBe(false);
  });

  it("accepts every date choice it knows", () => {
    expect(v.parse(taskQuerySchema, { date: "start" }).date).toBe("start");
  });

  it("freezes the shared default so a consumer's mutation fails loudly instead of corrupting later queries", () => {
    expect(() => {
      DEFAULT_TASK_QUERY.filter.conditions.push({ type: "status", condition: "is", statuses: ["done"] });
    }).toThrow(TypeError);
  });

  it("still hands out a mutable fresh object from a plain parse", () => {
    const parsed = v.parse(taskQuerySchema, {});
    expect(() => {
      parsed.filter.conditions.push({ type: "status", condition: "is", statuses: ["done"] });
    }).not.toThrow();
  });
});
