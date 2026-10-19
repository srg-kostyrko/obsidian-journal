import { describe, expect, it } from "vitest";
import { nextTick } from "vue";

import { anchor } from "@/calendar/testing";
import { NoteMetadataService, NotesService, type VaultPath } from "@/infrastructure/host";
import { FakeNoteMetadataService, FakeNotesService } from "@/infrastructure/host/testing";
import { journalsCoreModule } from "@/journals/module";
import { SettingsService } from "@/settings";
import { overrideWith, testContainer } from "@/testing";

import { tasksCoreModule } from "../../module";
import { TaskIndex } from "../../task-index";
import { TaskProviderToken } from "../../types";

import { NotePropertyTaskProvider } from "./provider";
import { NOTE_PROPERTY_PROVIDER_ID, notePropertySlice } from "./slice";

const path = "Tasks/a.md" as VaultPath;
const moved = "Tasks/b.md" as VaultPath;

const taskMeta = (properties: Record<string, unknown> | undefined = undefined) => ({
  title: "a",
  tags: ["#task"],
  properties: properties ?? { scheduled: "2026-10-21" },
});

async function build(enabled = true) {
  const notes = new FakeNotesService();
  const metadata = new FakeNoteMetadataService();
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    data: { tasksNoteProperty: { enabled } },
    overrides: [overrideWith(NotesService, notes as never), overrideWith(NoteMetadataService, metadata as never)],
  });
  const provider = harness.resolve(TaskProviderToken).find((candidate) => candidate.id === NOTE_PROPERTY_PROVIDER_ID);
  if (!(provider instanceof NotePropertyTaskProvider)) throw new TypeError("note-property provider not registered");
  const index = harness.resolve(TaskIndex);
  const slice = harness.resolve(SettingsService).getSlice(notePropertySlice);
  return { notes, metadata, provider, index, slice };
}

describe("NotePropertyTaskProvider", () => {
  it("publishes nothing while disabled, the shipped default", async () => {
    const { notes, metadata, provider, index } = await build(false);
    notes.seed(path);
    metadata.setMetadata(path, taskMeta());

    provider.start();

    expect(index.itemsIn(path)).toEqual([]);
  });

  it("publishes a note item for a tagged note once enabled", async () => {
    const { notes, metadata, provider, index } = await build();
    notes.seed(path);
    metadata.setMetadata(path, taskMeta());

    provider.start();

    expect(index.itemsIn(path)).toEqual([
      {
        provider: "note-property",
        key: "note-property:Tasks/a.md",
        path,
        status: "todo",
        relations: ["date"],
        capabilities: { movable: false, stampable: false, retargetable: true },
        display: { kind: "note", path, title: "a" },
        dates: { scheduled: anchor("2026-10-21") },
      },
    ]);
  });

  it("ignores notes without the task tag", async () => {
    const { notes, metadata, provider, index } = await build();
    notes.seed(path);
    metadata.setMetadata(path, { ...taskMeta(), tags: ["#other"] });

    provider.start();

    expect(index.itemsIn(path)).toEqual([]);
  });

  it("drops the item when the tag is removed and follows a changed date", async () => {
    const { notes, metadata, provider, index } = await build();
    notes.seed(path);
    metadata.setMetadata(path, taskMeta());
    provider.start();

    metadata.setMetadata(path, taskMeta({ scheduled: "2026-11-02" }));
    notes.emitMetadataChanged(path);
    expect(index.itemsIn(path).at(0)?.dates.scheduled).toBe(anchor("2026-11-02"));

    metadata.setMetadata(path, { ...taskMeta(), tags: [] });
    notes.emitMetadataChanged(path);
    expect(index.itemsIn(path)).toEqual([]);
  });

  it("moves the item to the new path on rename", async () => {
    const { notes, metadata, provider, index } = await build();
    notes.seed(path);
    metadata.setMetadata(path, taskMeta());
    provider.start();

    metadata.setMetadata(moved, taskMeta());
    await notes.rename(path, moved);

    expect(index.itemsIn(path)).toEqual([]);
    expect(index.itemsIn(moved).map((item) => item.key)).toEqual(["note-property:Tasks/b.md"]);
  });

  it("removes the item when the note is deleted", async () => {
    const { notes, metadata, provider, index } = await build();
    notes.seed(path);
    metadata.setMetadata(path, taskMeta());
    provider.start();

    await notes.delete(path);

    expect(index.itemsIn(path)).toEqual([]);
  });

  it("republishes from the new property in one version bump when the slice is edited", async () => {
    const { notes, metadata, provider, index, slice } = await build();
    notes.seed(path);
    metadata.setMetadata(path, taskMeta({ scheduled: "2026-10-21", plan: "2026-12-01" }));
    provider.start();
    const before = index.version();

    slice.state.dates = { ...slice.state.dates, scheduled: "plan" };
    await nextTick();

    expect(index.itemsIn(path).at(0)?.dates.scheduled).toBe(anchor("2026-12-01"));
    expect(index.version()).toBe(before + 1);
  });

  it("clears every item in one version bump when disabled", async () => {
    const { notes, metadata, provider, index, slice } = await build();
    const other = "Tasks/c.md" as VaultPath;
    for (const target of [path, other]) {
      notes.seed(target);
      metadata.setMetadata(target, taskMeta());
    }
    provider.start();
    const before = index.version();

    slice.state.enabled = false;
    await nextTick();

    expect(index.itemsIn(path)).toEqual([]);
    expect(index.itemsIn(other)).toEqual([]);
    expect(index.version()).toBe(before + 1);
  });

  it("stops reacting once its disposer runs", async () => {
    const { notes, metadata, provider, index, slice } = await build();
    notes.seed(path);
    metadata.setMetadata(path, taskMeta());
    const stop = provider.start();
    stop();

    slice.state.enabled = false;
    await nextTick();
    notes.emitMetadataChanged(path);

    expect(index.itemsIn(path)).toHaveLength(1);
  });
});
