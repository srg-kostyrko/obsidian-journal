import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { DEFAULT_TASK_QUERY } from "@/tasks/query";

import { tasksCodeBlock } from "./tasks-block";
import { tasksBlockKeys, tasksBlockSchema, toTaskQuery } from "./tasks-config";

// The schema's output mirrors the raw fence keys flatly, the way every other registered fence's
// schema does — `manual-fences.test.ts`'s `degraded()` check does a flat per-key lookup
// (`output[key]`), so a nested output would make it misreport every documented key beyond `sort`
// as "falls back to its default" even when the schema handled it correctly. Desugaring into a
// `TaskQuery` is `toTaskQuery`'s job, not the schema's.
describe("tasksBlockSchema", () => {
  it("defaults a bare fence's flat fields", () => {
    expect(v.parse(tasksBlockSchema, {})).toEqual({
      provider: [],
      source: "both",
      depth: "literal",
      status: undefined,
      heading: undefined,
      tag: undefined,
      sort: "document",
      conditions: [],
    });
  });

  it("does not list `date` among its known keys, so a fence using it is told it is unrecognized", () => {
    expect(tasksBlockKeys).not.toContain("date");
  });

  it("reports its own keys, in desugar order", () => {
    expect(tasksBlockKeys).toEqual(["provider", "source", "depth", "status", "heading", "tag", "sort", "conditions"]);
  });

  it("reads a single value written as one thing as a one-item list", () => {
    expect(v.parse(tasksBlockSchema, { tag: "#work" }).tag).toEqual(["#work"]);
    expect(v.parse(tasksBlockSchema, { provider: "checkbox" }).provider).toEqual(["checkbox"]);
  });

  it("keeps a list of values as-is", () => {
    expect(v.parse(tasksBlockSchema, { status: ["done", "cancelled"] }).status).toEqual(["done", "cancelled"]);
  });

  it("falls back source to both on an unknown value", () => {
    expect(v.parse(tasksBlockSchema, { source: "notelets" }).source).toBe("notelets");
    expect(v.parse(tasksBlockSchema, { source: "nope" }).source).toBe("both");
  });

  it("falls back depth to literal on an unknown value", () => {
    expect(v.parse(tasksBlockSchema, { depth: "rollup" }).depth).toBe("rollup");
    expect(v.parse(tasksBlockSchema, { depth: "nope" }).depth).toBe("literal");
  });

  it("falls back sort to document on a role it does not know", () => {
    expect(v.parse(tasksBlockSchema, { sort: "due" }).sort).toBe("due");
    expect(v.parse(tasksBlockSchema, { sort: "priority" }).sort).toBe("document");
  });

  it("degrades a malformed full-form conditions value to an empty list, rather than an error", () => {
    expect(v.parse(tasksBlockSchema, { conditions: "not-a-list" }).conditions).toEqual([]);
  });

  it("degrades a mapping written for a list key to no constraint", () => {
    expect(v.parse(tasksBlockSchema, { tag: { a: 1 } }).tag).toEqual([]);
  });

  it("registers the journal-tasks key", () => {
    expect(tasksCodeBlock.keys).toEqual(["journal-tasks"]);
    expect(tasksCodeBlock.cssClass).toEqual(["journal-tasks-code-block"]);
  });
});

describe("toTaskQuery", () => {
  it("defaults a bare fence to both sources, this period, open items", () => {
    expect(toTaskQuery(v.parse(tasksBlockSchema, {}))).toEqual(DEFAULT_TASK_QUERY);
  });

  it("sets scope.provider/source/depth from the flat fields", () => {
    const parsed = v.parse(tasksBlockSchema, { provider: "checkbox", source: "notelets", depth: "rollup" });
    expect(toTaskQuery(parsed).scope).toEqual({ provider: ["checkbox"], source: "notelets", depth: "rollup" });
  });

  it("desugars each flat key into exactly one condition, status before heading", () => {
    const parsed = v.parse(tasksBlockSchema, { heading: "## Tasks", status: "done" });
    expect(toTaskQuery(parsed).filter.conditions).toEqual([
      { type: "status", condition: "is", statuses: ["done"] },
      { type: "heading", condition: "under", headings: ["## Tasks"] },
    ]);
  });

  it("orders desugared conditions status, then heading, then tag", () => {
    const parsed = v.parse(tasksBlockSchema, { tag: "#work", heading: "## Tasks", status: "done" });
    expect(toTaskQuery(parsed).filter.conditions).toEqual([
      { type: "status", condition: "is", statuses: ["done"] },
      { type: "heading", condition: "under", headings: ["## Tasks"] },
      { type: "tag", condition: "has", tags: ["#work"] },
    ]);
  });

  it("keeps the default open-status condition when no sugar key narrows it", () => {
    const parsed = v.parse(tasksBlockSchema, { tag: "#work" });
    expect(toTaskQuery(parsed).filter.conditions).toEqual([
      { type: "status", condition: "is", statuses: ["open"] },
      { type: "tag", condition: "has", tags: ["#work"] },
    ]);
  });

  it("desugars a status list", () => {
    const parsed = v.parse(tasksBlockSchema, { status: ["done", "cancelled"] });
    expect(toTaskQuery(parsed).filter.conditions).toEqual([
      { type: "status", condition: "is", statuses: ["done", "cancelled"] },
    ]);
  });

  it("appends the full-form conditions key after every desugared one", () => {
    const parsed = v.parse(tasksBlockSchema, {
      status: "done",
      conditions: [{ type: "tag", condition: "lacks", tags: ["#waiting"] }],
    });
    expect(toTaskQuery(parsed).filter.conditions).toEqual([
      { type: "status", condition: "is", statuses: ["done"] },
      { type: "tag", condition: "lacks", tags: ["#waiting"] },
    ]);
  });

  it("still adds a present-but-unconstrained condition for a key that degraded to an empty list", () => {
    const parsed = v.parse(tasksBlockSchema, { tag: { a: 1 } });
    expect(toTaskQuery(parsed).filter.conditions).toContainEqual({
      type: "tag",
      condition: "has",
      tags: [],
    });
  });
});
