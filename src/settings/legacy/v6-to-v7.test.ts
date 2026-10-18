import { describe, expect, it } from "vitest";

import { runMigrations } from "../migrations";
import { CURRENT_VERSION } from "../version";

import { legacyMigrations } from "./module";
import { v6ToV7Migration } from "./v6-to-v7";

const tasksFilter = { mode: "and", conditions: [] };
const anyOpen = { type: "tasks", quantifier: "any", status: "open", source: "both", filter: tasksFilter };
const allDone = { type: "tasks", quantifier: "all", status: "done", source: "both", filter: tasksFilter };

function withConditions(...conditions: unknown[]): Record<string, unknown> {
  return { journals: { daily: { name: "daily", decorations: [{ mode: "all", styles: [], conditions }] } } };
}

function conditionsOf(raw: Record<string, unknown>): unknown[] {
  const out = v6ToV7Migration.migrate(raw) as {
    journals: { daily: { decorations: { conditions: unknown[] }[] } };
  };
  return out.journals.daily.decorations[0]?.conditions ?? [];
}

describe("v6ToV7Migration", () => {
  it("rewrites has-open-task into an any-open tasks condition", () => {
    expect(conditionsOf(withConditions({ type: "has-open-task" }))).toEqual([anyOpen]);
  });

  it("rewrites all-tasks-completed into an all-done tasks condition", () => {
    expect(conditionsOf(withConditions({ type: "all-tasks-completed" }))).toEqual([allDone]);
  });

  it("keeps order and leaves other conditions deep-equal", () => {
    const title = { type: "title", value: "x" };
    const weekday = { type: "weekday", days: [1] };
    const raw = withConditions(title, { type: "has-open-task" }, weekday);
    const out = v6ToV7Migration.migrate(raw) as {
      journals: { daily: { decorations: { mode: string; styles: unknown[]; conditions: unknown[] }[] } };
    };
    const decoration = out.journals.daily.decorations[0];
    expect(decoration?.conditions).toEqual([title, anyOpen, weekday]);
    expect(decoration?.mode).toBe("all");
    expect(decoration?.styles).toEqual([]);
  });

  it("rewrites every decoration of every journal", () => {
    const raw = {
      journals: {
        a: {
          decorations: [{ conditions: [{ type: "has-open-task" }] }, { conditions: [{ type: "all-tasks-completed" }] }],
        },
        b: { decorations: [{ conditions: [{ type: "all-tasks-completed" }, { type: "has-open-task" }] }] },
      },
    };
    expect(v6ToV7Migration.migrate(raw)).toEqual({
      journals: {
        a: { decorations: [{ conditions: [anyOpen] }, { conditions: [allDone] }] },
        b: { decorations: [{ conditions: [allDone, anyOpen] }] },
      },
    });
  });

  it("gives each rewritten condition its own filter object", () => {
    const [first, second] = conditionsOf(withConditions({ type: "has-open-task" }, { type: "has-open-task" })) as {
      filter: object;
    }[];
    expect(first?.filter).not.toBe(second?.filter);
  });

  it.each([
    ["missing journals", {}],
    ["a journal with no decorations", { journals: { a: { name: "a" } } }],
    ["a decoration with no conditions", { journals: { a: { decorations: [{ mode: "all" }] } } }],
    ["a non-object condition", { journals: { a: { decorations: [{ conditions: [null, "x", 3] }] } } }],
    ["a null journal", { journals: { a: null } }],
    ["a null decoration", { journals: { a: { decorations: [null] } } }],
  ])("does not throw on %s and leaves it as is", (_label, raw) => {
    const copy = structuredClone(raw);
    expect(() => v6ToV7Migration.migrate(raw)).not.toThrow();
    expect(raw).toEqual(copy);
  });

  it("leaves already-migrated tasks conditions unchanged", () => {
    expect(conditionsOf(withConditions(anyOpen))).toEqual([anyOpen]);
  });

  it("runs in the chain from a v6 object to the current version", () => {
    const raw = { version: 6, ...withConditions({ type: "has-open-task" }) };
    const result = runMigrations(raw, legacyMigrations, CURRENT_VERSION);
    expect(result.isOk()).toBe(true);
    const value = result.isOk() ? (result.value as { version: number }) : undefined;
    expect(value?.version).toBe(7);
    expect(conditionsOf(value as unknown as Record<string, unknown>)).toEqual([anyOpen]);
  });
});
