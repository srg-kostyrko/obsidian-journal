import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { journalsCoreModule } from "@/journals/module";
import { testContainer } from "@/testing";

import { tasksCoreModule } from "../../module";

import { DEFAULT_CANONICAL, DEFAULT_IDENTIFY, notePropertySlice, notePropertySliceSchema } from "./slice";

async function load(stored: Record<string, unknown>) {
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    data: { tasksNoteProperty: stored },
    allow: { dataRepair: true },
  });
  const repair = harness.logs.records.find((record) => record.message === "slice fields reset to defaults");
  return { state: harness.settings.getSlice(notePropertySlice).state, repair };
}

describe("notePropertySliceSchema", () => {
  it("defaults to disabled with the TaskNotes-shaped property names", () => {
    expect(v.parse(notePropertySliceSchema, {})).toEqual({
      enabled: false,
      setUp: false,
      identify: { by: "tag", tag: "#task" },
      excludedFolders: [],
      archiveTag: "#archived",
      dates: { due: "due", scheduled: "scheduled", done: "completedDate", created: "dateCreated" },
      statusProperty: "status",
      statusMap: { none: "todo", open: "todo", "in-progress": "in-progress", done: "done" },
      canonical: { todo: "open", done: "done", "in-progress": "in-progress" },
      titleProperty: "title",
      modifiedProperty: "dateModified",
      recurrenceProperties: ["recurrence", "recurrence_parent"],
    });
  });
});

describe("notePropertySlice repair on load", () => {
  it.each([
    ["enabled", "yes", false, "enabled"],
    ["setUp", "yes", false, "setUp"],
    ["identify", { by: "tag", tag: 5 }, DEFAULT_IDENTIFY, "identify"],
    ["identify", { by: "nonsense" }, DEFAULT_IDENTIFY, "identify"],
    ["excludedFolders", ["Archive", 5], ["Archive"], "excludedFolders.1"],
    ["archiveTag", 5, "#archived", "archiveTag"],
    ["dates", { due: 5, scheduled: "when" }, { scheduled: "when" }, "dates.due"],
    ["dates", 7, { due: "due", scheduled: "scheduled", done: "completedDate", created: "dateCreated" }, "dates"],
    ["statusProperty", 5, "status", "statusProperty"],
    ["statusMap", { open: "todo", x: 5 }, { open: "todo" }, "statusMap.x"],
    ["canonical", 7, DEFAULT_CANONICAL, "canonical"],
    ["titleProperty", 5, "title", "titleProperty"],
    ["modifiedProperty", 5, "dateModified", "modifiedProperty"],
  ] as const)("an unreadable %s (%j) repairs to %j and logs it", async (key, stored, expected, field) => {
    const siblings = { enabled: true, statusProperty: "state" };
    const { state, repair } = await load({ ...siblings, [key]: stored });

    expect(state).toEqual({ ...v.parse(notePropertySliceSchema, siblings), [key]: expected });
    expect(repair?.fields).toMatchObject({ sliceKey: "tasksNoteProperty", fields: [field] });
  });

  // A single unreadable entry would leave the list empty under the deep repair, switching off the
  // recurring-task guard; the defaults keep it on.
  it("an unreadable recurrence property list falls back to the defaults", async () => {
    const { state } = await load({ enabled: true, recurrenceProperties: [5] });

    expect(state.recurrenceProperties).toEqual(["recurrence", "recurrence_parent"]);
    expect(state.enabled).toBe(true);
  });
});
