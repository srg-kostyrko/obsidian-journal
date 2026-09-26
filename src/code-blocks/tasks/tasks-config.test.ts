import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { DEFAULT_TASK_QUERY } from "@/tasks/query";

import { tasksCodeBlock } from "./tasks-block";
import { tasksBlockKeys, tasksBlockSchema } from "./tasks-config";

describe("tasksBlockSchema", () => {
  it("defaults a bare fence to both sources, this period, open items", () => {
    expect(v.parse(tasksBlockSchema, {})).toEqual(DEFAULT_TASK_QUERY);
  });

  it("desugars each flat key into exactly one condition, status before heading", () => {
    const parsed = v.parse(tasksBlockSchema, { heading: "## Tasks", status: "done" });
    expect(parsed.filter.conditions).toEqual([
      { type: "status", condition: "is", statuses: ["done"] },
      { type: "heading", condition: "under", headings: ["## Tasks"] },
    ]);
  });

  it("orders desugared conditions status, then heading, then tag", () => {
    const parsed = v.parse(tasksBlockSchema, { tag: "#work", heading: "## Tasks", status: "done" });
    expect(parsed.filter.conditions).toEqual([
      { type: "status", condition: "is", statuses: ["done"] },
      { type: "heading", condition: "under", headings: ["## Tasks"] },
      { type: "tag", condition: "has", tags: ["#work"] },
    ]);
  });

  it("reads a single value written as one thing as a one-item list", () => {
    expect(v.parse(tasksBlockSchema, { tag: "#work" }).filter.conditions).toContainEqual({
      type: "tag",
      condition: "has",
      tags: ["#work"],
    });
  });

  it("does not list `date` among its known keys, so a fence using it is told it is unrecognized", () => {
    expect(tasksBlockKeys).not.toContain("date");
  });

  it("reports its own keys, in desugar order", () => {
    expect(tasksBlockKeys).toEqual(["provider", "source", "depth", "status", "heading", "tag", "sort", "conditions"]);
  });

  it("sets scope.provider from a single provider id or a list", () => {
    expect(v.parse(tasksBlockSchema, { provider: "checkbox" }).scope.provider).toEqual(["checkbox"]);
    expect(v.parse(tasksBlockSchema, { provider: ["checkbox", "note-property"] }).scope.provider).toEqual([
      "checkbox",
      "note-property",
    ]);
  });

  it("sets scope.source, falling back to both on an unknown value", () => {
    expect(v.parse(tasksBlockSchema, { source: "notelets" }).scope.source).toBe("notelets");
    expect(v.parse(tasksBlockSchema, { source: "nope" }).scope.source).toBe("both");
  });

  it("sets scope.depth, falling back to literal on an unknown value", () => {
    expect(v.parse(tasksBlockSchema, { depth: "rollup" }).scope.depth).toBe("rollup");
    expect(v.parse(tasksBlockSchema, { depth: "nope" }).scope.depth).toBe("literal");
  });

  it("sets sort, falling back to document on a role it does not know", () => {
    expect(v.parse(tasksBlockSchema, { sort: "due" }).sort).toBe("due");
    expect(v.parse(tasksBlockSchema, { sort: "priority" }).sort).toBe("document");
  });

  it("keeps the default open-status condition when no sugar key narrows it", () => {
    expect(v.parse(tasksBlockSchema, { tag: "#work" }).filter.conditions).toEqual([
      { type: "status", condition: "is", statuses: ["open"] },
      { type: "tag", condition: "has", tags: ["#work"] },
    ]);
  });

  it("desugars a status list", () => {
    expect(v.parse(tasksBlockSchema, { status: ["done", "cancelled"] }).filter.conditions).toEqual([
      { type: "status", condition: "is", statuses: ["done", "cancelled"] },
    ]);
  });

  it("appends the full-form conditions key after every desugared one", () => {
    const parsed = v.parse(tasksBlockSchema, {
      status: "done",
      conditions: [{ type: "tag", condition: "lacks", tags: ["#waiting"] }],
    });
    expect(parsed.filter.conditions).toEqual([
      { type: "status", condition: "is", statuses: ["done"] },
      { type: "tag", condition: "lacks", tags: ["#waiting"] },
    ]);
  });

  it("degrades a malformed full-form conditions value to no extra conditions, rather than an error", () => {
    expect(v.parse(tasksBlockSchema, { conditions: "not-a-list" }).filter.conditions).toEqual([
      { type: "status", condition: "is", statuses: ["open"] },
    ]);
  });

  it("degrades a mapping written for a list key to no constraint", () => {
    expect(v.parse(tasksBlockSchema, { tag: { a: 1 } }).filter.conditions).toContainEqual({
      type: "tag",
      condition: "has",
      tags: [],
    });
  });

  it("registers the journal-tasks key", () => {
    expect(tasksCodeBlock.keys).toEqual(["journal-tasks"]);
    expect(tasksCodeBlock.cssClass).toEqual(["journal-tasks-code-block"]);
  });
});
