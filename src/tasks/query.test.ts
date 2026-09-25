import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { DEFAULT_TASK_QUERY, taskQuerySchema } from "./query";

describe("taskQuerySchema", () => {
  it("defaults a bare query to both sources, this period, open items, document order", () => {
    expect(v.parse(taskQuerySchema, {})).toEqual(DEFAULT_TASK_QUERY);
    expect(DEFAULT_TASK_QUERY).toEqual({
      scope: { provider: [], source: "both", depth: "literal" },
      filter: { mode: "and", conditions: [{ type: "status", condition: "is", statuses: ["open"] }] },
      sort: "document",
    });
  });

  it("keeps an explicit empty filter, so `status: all` is expressible as no constraint", () => {
    const parsed = v.parse(taskQuerySchema, { filter: { mode: "and", conditions: [] } });
    expect(parsed.filter.conditions).toEqual([]);
  });

  it("falls back to document order on a sort key it does not know", () => {
    expect(v.parse(taskQuerySchema, { sort: "priority" }).sort).toBe("document");
  });
});
