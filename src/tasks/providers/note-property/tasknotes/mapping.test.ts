import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { notePropertySlice, notePropertySliceSchema } from "../slice";

import { fromTaskNotes } from "./mapping";
import { buildTaskNotesSettings } from "./testing";

const status = (value: string, order: number, isCompleted = false) => ({ value, order, isCompleted });

describe("fromTaskNotes", () => {
  it("maps TaskNotes' defaults onto the provider's defaults", () => {
    expect(fromTaskNotes(buildTaskNotesSettings())).toEqual({
      enabled: true,
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

  it("strips a leading hash from the task tag", () => {
    expect(fromTaskNotes(buildTaskNotesSettings({ taskTag: "#chore" })).identify).toEqual({
      by: "tag",
      tag: "#chore",
    });
  });

  it("identifies by property when TaskNotes does", () => {
    const mapped = fromTaskNotes(
      buildTaskNotesSettings({
        taskIdentificationMethod: "property",
        taskPropertyName: "type",
        taskPropertyValue: "task",
      }),
    );
    expect(mapped.identify).toEqual({ by: "property", name: "type", value: "task" });
  });

  it("splits, trims and strips slashes from excluded folders", () => {
    expect(
      fromTaskNotes(buildTaskNotesSettings({ excludedFolders: " Archive/, Templates ,/a/b/," })).excludedFolders,
    ).toEqual(["Archive", "Templates", "a/b"]);
  });

  it("writes an empty archive tag when the mapping is empty", () => {
    const base = buildTaskNotesSettings();
    const mapped = fromTaskNotes({ ...base, fieldMapping: { ...base.fieldMapping, archiveTag: "" } });
    expect(mapped.archiveTag).toBe("");
  });

  it("drops empty recurrence properties", () => {
    const base = buildTaskNotesSettings();
    const mapped = fromTaskNotes({ ...base, fieldMapping: { ...base.fieldMapping, recurrenceParent: "" } });
    expect(mapped.recurrenceProperties).toEqual(["recurrence"]);
  });

  describe("custom statuses", () => {
    it("keys the status map by lowercased value and keeps TaskNotes' case in canonical", () => {
      const mapped = fromTaskNotes(
        buildTaskNotesSettings({
          defaultTaskStatus: "Open",
          customStatuses: [status("Open", 0), status("Done", 1, true)],
        }),
      );
      expect(mapped.statusMap).toEqual({ open: "todo", done: "done" });
      expect(mapped.canonical).toEqual({ todo: "Open", done: "Done" });
    });

    it("maps done to the lowest-order completed status", () => {
      const mapped = fromTaskNotes(
        buildTaskNotesSettings({
          customStatuses: [status("open", 0), status("cancelled", 5, true), status("done", 2, true)],
        }),
      );
      expect(mapped.canonical?.done).toBe("done");
      expect(mapped.statusMap).toMatchObject({ cancelled: "done", done: "done" });
    });

    it("falls back to the lowest-order open status when the default is completed", () => {
      const mapped = fromTaskNotes(
        buildTaskNotesSettings({
          defaultTaskStatus: "done",
          customStatuses: [status("none", 0), status("open", 1), status("done", 2, true)],
        }),
      );
      expect(mapped.canonical?.todo).toBe("none");
    });

    it("leaves done uncanonical when no status is completed", () => {
      const mapped = fromTaskNotes(
        buildTaskNotesSettings({ customStatuses: [status("open", 0), status("in-progress", 1)] }),
      );
      expect(mapped.canonical).toEqual({ todo: "open", "in-progress": "in-progress" });
    });
  });

  it("maps a completed status named in-progress to done, never to canonical in-progress", () => {
    const mapped = fromTaskNotes(
      buildTaskNotesSettings({ customStatuses: [status("open", 0), status("In-Progress", 1, true)] }),
    );
    expect(mapped.statusMap).toEqual({ open: "todo", "in-progress": "done" });
    expect(mapped.canonical).toEqual({ todo: "open", done: "In-Progress" });
  });

  it("produces a patch the slice schema accepts unchanged", () => {
    const mapped = fromTaskNotes(buildTaskNotesSettings());
    const parsed = v.parse(notePropertySliceSchema, { ...notePropertySlice.defaults, ...mapped });
    expect(parsed).toMatchObject(mapped);
  });
});
