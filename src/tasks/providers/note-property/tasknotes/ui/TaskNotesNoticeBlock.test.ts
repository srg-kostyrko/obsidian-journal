import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { SettingsService } from "@/settings";
import { testContainer, type TestHarness } from "@/testing";

import { tasksCoreModule } from "../../../../module";
import { notePropertySlice } from "../../slice";
import { SetUpFromTaskNotesFlow } from "../flows/set-up-from-tasknotes.flow";
import { taskNotesNoticeSlice } from "../slice";
import { TaskNotesSource } from "../source";
import { buildTaskNotesSettings, taskNotesPlugin } from "../testing";

import TaskNotesNoticeBlock from "./TaskNotesNoticeBlock.vue";

async function harnessWith(
  data: NonNullable<Parameters<typeof testContainer>[0]>["data"] = {},
  plugin: object | null = taskNotesPlugin(buildTaskNotesSettings()),
): Promise<TestHarness> {
  const harness = await testContainer({ modules: [tasksCoreModule], data });
  if (plugin !== null) harness.host.putPlugin("tasknotes", plugin);
  return harness;
}

describe("TaskNotesNoticeBlock", () => {
  it("offers to set task notes up when TaskNotes is readable", async () => {
    const harness = await harnessWith();
    harness.render(TaskNotesNoticeBlock);
    expect(await screen.findByText(m.tasks_tasknotes_notice_message())).toBeTruthy();
  });

  const readable = taskNotesPlugin(buildTaskNotesSettings());
  it.each([
    ["TaskNotes is not loaded", {}, null],
    ["TaskNotes' settings are unrecognised", {}, taskNotesPlugin({ customStatuses: "x" })],
    ["task notes are already enabled", { tasksNoteProperty: { enabled: true, setUp: true } }, readable],
    // Enabled by hand and later switched off, before TaskNotes was installed.
    ["task notes were set up before", { tasksNoteProperty: { enabled: false, setUp: true } }, readable],
    ["it was dismissed", { tasknotesNotice: { dismissed: true } }, readable],
  ])("stays hidden when %s", async (_, data, plugin) => {
    const harness = await harnessWith(data, plugin);
    harness.render(TaskNotesNoticeBlock);
    expect(screen.queryByText(m.tasks_tasknotes_notice_heading())).toBeNull();
  });

  it.each([
    ["dismissed", { tasknotesNotice: { dismissed: true } }],
    ["already set up", { tasksNoteProperty: { setUp: true } }],
  ])("does not read TaskNotes' settings once %s", async (_, data) => {
    const harness = await harnessWith(data);
    const read = vi.spyOn(harness.resolve(TaskNotesSource), "read");
    harness.render(TaskNotesNoticeBlock);
    expect(read).not.toHaveBeenCalled();
  });

  it("remembers being dismissed and hides", async () => {
    const harness = await harnessWith();
    harness.render(TaskNotesNoticeBlock);
    await userEvent.click(await screen.findByText(m.tasks_tasknotes_notice_dismiss()));
    expect(harness.resolve(SettingsService).getSlice(taskNotesNoticeSlice).state.dismissed).toBe(true);
    expect(screen.queryByText(m.tasks_tasknotes_notice_heading())).toBeNull();
  });

  it("hides when task notes are enabled by hand while it is open", async () => {
    const harness = await harnessWith();
    harness.render(TaskNotesNoticeBlock);
    await screen.findByText(m.tasks_tasknotes_notice_heading());
    harness.resolve(SettingsService).getSlice(notePropertySlice).state.enabled = true;
    await vi.waitFor(() => expect(screen.queryByText(m.tasks_tasknotes_notice_heading())).toBeNull());
  });

  it("runs the set-up flow and disappears once task notes are set up, even if its modal is cancelled", async () => {
    const harness = await harnessWith();
    harness.render(TaskNotesNoticeBlock);
    await userEvent.click(await screen.findByText(m.tasks_tasknotes_notice_set_up()));

    expect(harness.modals.lastOpen()).toBeDefined();
    harness.modals.lastOpen().cancel();

    await vi.waitFor(() => expect(screen.queryByText(m.tasks_tasknotes_notice_heading())).toBeNull());
    expect(harness.resolve(SettingsService).getSlice(notePropertySlice).state.enabled).toBe(true);
  });

  it("hides without writing when TaskNotes is gone by the time Set up is clicked", async () => {
    const harness = await harnessWith();
    const invoke = vi.spyOn(harness.resolve(Flows), "invoke");
    harness.render(TaskNotesNoticeBlock);
    const setUp = await screen.findByText(m.tasks_tasknotes_notice_set_up());
    vi.spyOn(harness.resolve(TaskNotesSource), "read").mockReturnValue({ kind: "absent" });

    await userEvent.click(setUp);

    expect(invoke).toHaveBeenCalledWith(SetUpFromTaskNotesFlow, {});
    await vi.waitFor(() => expect(screen.queryByText(m.tasks_tasknotes_notice_heading())).toBeNull());
    expect(harness.resolve(SettingsService).getSlice(notePropertySlice).state.enabled).toBe(false);
    expect(harness.modals.opens).toHaveLength(0);
  });
});
