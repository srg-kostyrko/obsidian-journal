import { describe, expect, it } from "vitest";
import { nextTick } from "vue";

import { UserAborted } from "@/infrastructure/flows";
import { NoteMetadataService, NoteStructureService, NotesService, type VaultPath } from "@/infrastructure/host";
import { FakeNoteMetadataService, FakeNoteStructureService, FakeNotesService } from "@/infrastructure/host/testing";
import { JournalsIndex } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { SettingsService } from "@/settings";
import { overrideWith, testContainer } from "@/testing";

import { tasksCoreModule } from "../../../../module";
import { TaskIndex } from "../../../../task-index";
import { TaskProviderToken } from "../../../../types";
import { NOTE_PROPERTY_PROVIDER_ID, notePropertySlice } from "../../slice";
import { editNotePropertyProviderModal } from "../../ui/modals";
import { fromTaskNotes } from "../mapping";
import { buildTaskNotesSettings, taskNotesPlugin } from "../testing";

import { SetUpFromTaskNotesFlow } from "./set-up-from-tasknotes.flow";

const chore = "Tasks/chore.md" as VaultPath;

// A note only TaskNotes' tag identifies, so the copy is what makes it a task and moves the index.
async function build(plugin: object | undefined) {
  const notes = new FakeNotesService();
  const metadata = new FakeNoteMetadataService();
  const structures = new FakeNoteStructureService();
  notes.seed(chore);
  metadata.setMetadata(chore, { title: "chore", tags: ["#chore"], properties: { scheduled: "2026-10-21" } });
  structures.setStructure(chore, { listItems: [], tags: [], headings: [], frontmatterTags: ["#chore"] });
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    overrides: [
      overrideWith(NotesService, notes as never),
      overrideWith(NoteMetadataService, metadata as never),
      overrideWith(NoteStructureService, structures as never),
    ],
  });
  if (plugin !== undefined) harness.host.putPlugin("tasknotes", plugin);
  harness.resolve(JournalsIndex).markReady();
  const provider = harness.resolve(TaskProviderToken).find((candidate) => candidate.id === NOTE_PROPERTY_PROVIDER_ID);
  provider?.start();
  const slice = harness.resolve(SettingsService).getSlice(notePropertySlice);
  return { harness, slice, index: harness.resolve(TaskIndex) };
}

describe("SetUpFromTaskNotesFlow", () => {
  const settings = buildTaskNotesSettings({ taskTag: "chore", excludedFolders: "Archive" });

  it("copies TaskNotes' settings in one refill and opens the provider modal", async () => {
    const { harness, slice, index } = await build(taskNotesPlugin(settings));
    const before = index.version();

    const running = harness.resolve(SetUpFromTaskNotesFlow).execute();
    await nextTick();

    expect(slice.state).toMatchObject({ ...fromTaskNotes(settings), setUp: true });
    expect(index.version()).toBe(before + 1);
    expect(index.itemsIn(chore)).toHaveLength(1);
    expect(harness.modals.lastOpen().definition).toBe(editNotePropertyProviderModal);
    harness.modals.lastOpen().submit(undefined);
    const result = await running;
    expect(result.kind).toBe("ok");
  });

  it("keeps the copy and the provider enabled when the modal is cancelled", async () => {
    const { harness, slice } = await build(taskNotesPlugin(settings));

    const running = harness.resolve(SetUpFromTaskNotesFlow).execute();
    harness.modals.lastOpen().cancel();
    const result = await running;

    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(slice.state).toMatchObject({ ...fromTaskNotes(settings), enabled: true, setUp: true });
  });

  it.each([
    ["disabled since the card rendered", undefined],
    ["no longer readable", taskNotesPlugin({ customStatuses: "x" })],
  ])("writes nothing and opens no modal when TaskNotes is %s", async (_, plugin) => {
    const { harness, slice } = await build(plugin);
    const stored = JSON.parse(JSON.stringify(slice.state)) as unknown;

    const result = await harness.resolve(SetUpFromTaskNotesFlow).execute();

    expect(result.kind).toBe("ok");
    expect(slice.state).toEqual(stored);
    expect(harness.modals.opens).toHaveLength(0);
  });
});
