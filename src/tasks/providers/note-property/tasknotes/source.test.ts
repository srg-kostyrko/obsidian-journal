import { describe, expect, it } from "vitest";

import { testContainer } from "@/testing";

import { tasksCoreModule } from "../../../module";

import { TaskNotesSource } from "./source";
import { buildTaskNotesSettings, taskNotesPlugin } from "./testing";

async function readWith(plugin: object | undefined) {
  const harness = await testContainer({ modules: [tasksCoreModule] });
  if (plugin !== undefined) harness.host.putPlugin("tasknotes", plugin);
  return harness.resolve(TaskNotesSource).read();
}

describe("TaskNotesSource", () => {
  it("is absent while TaskNotes is not loaded", async () => {
    expect(await readWith(undefined)).toEqual({ kind: "absent" });
  });

  it("is unrecognised when the plugin carries no settings", async () => {
    expect(await readWith({})).toEqual({ kind: "unrecognised" });
  });

  it("is unrecognised when a field we read has the wrong type", async () => {
    expect(await readWith(taskNotesPlugin({ customStatuses: "x" }))).toEqual({ kind: "unrecognised" });
  });

  it("reads a full settings object, ignoring fields it does not use", async () => {
    const settings = buildTaskNotesSettings({ taskTag: "chore" });
    expect(await readWith(taskNotesPlugin({ ...settings, somethingElse: 25 }))).toEqual({
      kind: "read",
      settings,
    });
  });

  it("fills TaskNotes' defaults when fieldMapping and the rest are missing", async () => {
    expect(await readWith(taskNotesPlugin({}))).toEqual({ kind: "read", settings: buildTaskNotesSettings() });
  });

  it("is unrecognised when reading settings throws", async () => {
    const plugin = {
      get settings(): unknown {
        throw new Error("boom");
      },
    };
    expect(await readWith(plugin)).toEqual({ kind: "unrecognised" });
  });

  it("is unrecognised when a nested getter throws", async () => {
    const settings = {
      get customStatuses(): unknown {
        throw new Error("boom");
      },
    };
    expect(await readWith(taskNotesPlugin(settings))).toEqual({ kind: "unrecognised" });
  });

  it.each(["", "#", " #", "# ", "  "])("is unrecognised when the task tag %j would match nothing", async (taskTag) => {
    expect(await readWith(taskNotesPlugin({ taskTag }))).toEqual({ kind: "unrecognised" });
  });

  it("is unrecognised when identifying by property with no property name", async () => {
    const settings = { taskIdentificationMethod: "property", taskPropertyName: " ", taskPropertyValue: "task" };
    expect(await readWith(taskNotesPlugin(settings))).toEqual({ kind: "unrecognised" });
  });

  it.each(["", "  "])(
    "is unrecognised when identifying by property with the value %j, which TaskNotes matches nothing by",
    async (taskPropertyValue) => {
      const settings = { taskIdentificationMethod: "property", taskPropertyName: "type", taskPropertyValue };
      expect(await readWith(taskNotesPlugin(settings))).toEqual({ kind: "unrecognised" });
    },
  );

  it("reads excluded folders written as a list, the way TaskNotes accepts them", async () => {
    const read = await readWith(taskNotesPlugin({ excludedFolders: ["Archive", "Templates"] }));
    expect(read).toEqual({
      kind: "read",
      settings: buildTaskNotesSettings({ excludedFolders: ["Archive", "Templates"] }),
    });
  });

  it("is unrecognised when an excluded folder in the list is not text", async () => {
    expect(await readWith(taskNotesPlugin({ excludedFolders: ["Archive", 3] }))).toEqual({ kind: "unrecognised" });
  });

  it("ignores an empty tag while identifying by property", async () => {
    const settings = {
      taskIdentificationMethod: "property",
      taskTag: "",
      taskPropertyName: "type",
      taskPropertyValue: "task",
    };
    const read = await readWith(taskNotesPlugin(settings));
    expect(read.kind).toBe("read");
  });
});
