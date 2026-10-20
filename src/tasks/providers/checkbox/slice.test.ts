import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { journalsCoreModule } from "@/journals/module";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "../../module";

import { DEFAULT_CANONICAL, DEFAULT_STATUS_MAP, checkboxSlice, checkboxSliceSchema } from "./slice";

async function load(stored: Record<string, unknown>) {
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    data: { tasksCheckbox: stored },
    allow: { dataRepair: true },
  });
  const repair = harness.logs.records.find((record) => record.message === "slice fields reset to defaults");
  return { state: harness.settings.getSlice(checkboxSlice).state, repair };
}

const tag = { type: "tag", condition: "has", tags: ["#todo"] };

describe("checkboxSlice repair on load", () => {
  it("accepts any string in the status map so an unknown status name cannot reset the slice", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule, tasksCoreModule],
      data: { tasksCheckbox: { statusMap: { "?": "whatever" } } },
    });
    expect(harness.settings.getSlice(checkboxSlice).state.statusMap["?"]).toBe("whatever");
  });

  it.each([
    ["enabled", "yes", true, "enabled"],
    ["rule", { mode: "nonsense", conditions: [tag] }, { mode: "and", conditions: [tag] }, "rule.mode"],
    [
      "rule",
      { mode: "or", conditions: [tag, { type: "moon-phase" }] },
      { mode: "or", conditions: [tag] },
      "rule.conditions.1",
    ],
    ["rule", "nonsense", { mode: "and", conditions: [] }, "rule"],
    ["statusMap", { " ": "todo", "?": 5 }, { " ": "todo" }, "statusMap.?"],
    [
      "statusMap",
      "not-an-object",
      { " ": "todo", x: "done", X: "done", "/": "in-progress", "-": "cancelled" },
      "statusMap",
    ],
    ["canonical", { done: 5 }, DEFAULT_CANONICAL, "canonical"],
    ["canonical", 7, DEFAULT_CANONICAL, "canonical"],
  ] as const)("an unreadable %s (%j) repairs to %j and logs it", async (key, stored, expected, field) => {
    const siblings = { enabled: false, canonical: { done: "x" } };
    const { state, repair } = await load({ ...siblings, [key]: stored });

    expect(state).toEqual({ ...v.parse(checkboxSliceSchema, siblings), [key]: expected });
    expect(repair?.fields).toMatchObject({ sliceKey: "tasksCheckbox", fields: [field] });
  });

  // An empty status map reads every marker as to-do and an empty canonical map refuses every tick,
  // so a map whose every entry is unreadable takes the defaults instead.
  it("a status map and canonical map of a newer shape repair to the defaults", async () => {
    const { state, repair } = await load({
      statusMap: { " ": { s: "todo" }, x: { s: "done" } },
      canonical: { done: { s: "x" } },
    });

    expect(state.statusMap).toEqual(DEFAULT_STATUS_MAP);
    expect(state.canonical).toEqual(DEFAULT_CANONICAL);
    expect(repair?.fields).toMatchObject({ sliceKey: "tasksCheckbox", fields: ["statusMap", "canonical"] });
  });
});
