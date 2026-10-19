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
});
