import { describe, expect, it } from "vitest";
import { nextTick } from "vue";

import { anchor } from "@/calendar/testing";
import { NoteMetadataService, NoteStructureService, NotesService, type VaultPath } from "@/infrastructure/host";
import { FakeNoteMetadataService, FakeNoteStructureService, FakeNotesService } from "@/infrastructure/host/testing";
import { JournalsIndex } from "@/journals";
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

interface NoteShape {
  readonly properties?: Record<string, unknown>;
  readonly frontmatterTags?: string[];
  readonly bodyTags?: string[];
}

async function build(enabled = true, ready = true) {
  const notes = new FakeNotesService();
  const metadata = new FakeNoteMetadataService();
  const structures = new FakeNoteStructureService();
  const harness = await testContainer({
    modules: [journalsCoreModule, tasksCoreModule],
    data: { tasksNoteProperty: { enabled } },
    overrides: [
      overrideWith(NotesService, notes as never),
      overrideWith(NoteMetadataService, metadata as never),
      overrideWith(NoteStructureService, structures as never),
    ],
  });
  const provider = harness.resolve(TaskProviderToken).find((candidate) => candidate.id === NOTE_PROPERTY_PROVIDER_ID);
  if (!(provider instanceof NotePropertyTaskProvider)) throw new TypeError("note-property provider not registered");
  const index = harness.resolve(TaskIndex);
  const journals = harness.resolve(JournalsIndex);
  if (ready) journals.markReady();
  const slice = harness.resolve(SettingsService).getSlice(notePropertySlice);
  // Mirrors what Obsidian reports: getAllTags merges body and frontmatter tags, the structure keeps them apart.
  const setNote = (target: VaultPath, shape: NoteShape = {}) => {
    const frontmatterTags = shape.frontmatterTags ?? ["#task"];
    const bodyTags = shape.bodyTags ?? [];
    metadata.setMetadata(target, {
      title: "a",
      tags: [...bodyTags, ...frontmatterTags],
      properties: shape.properties ?? { scheduled: "2026-10-21" },
    });
    structures.setStructure(target, {
      listItems: [],
      tags: bodyTags.map((tag) => ({ tag, line: 3 })),
      headings: [],
      frontmatterTags,
    });
  };
  return { journals, notes, setNote, provider, index, slice };
}

describe("NotePropertyTaskProvider", () => {
  it("publishes nothing while disabled, the shipped default", async () => {
    const { notes, setNote, provider, index } = await build(false);
    notes.seed(path);
    setNote(path);

    provider.start();

    expect(index.itemsIn(path)).toEqual([]);
  });

  it("waits for the journals index before walking the vault", async () => {
    const { journals, notes, setNote, provider, index } = await build(true, false);
    notes.seed(path);
    setNote(path);

    provider.start();
    expect(index.itemsIn(path)).toEqual([]);

    journals.markReady();
    await journals.whenReady();
    await Promise.resolve();
    expect(index.itemsIn(path)).toHaveLength(1);
  });

  it("does not walk the vault when disposed before the index is ready", async () => {
    const { journals, notes, setNote, provider, index } = await build(true, false);
    notes.seed(path);
    setNote(path);

    provider.start()();
    journals.markReady();
    await journals.whenReady();
    await Promise.resolve();

    expect(index.itemsIn(path)).toEqual([]);
  });

  it("publishes a note item for a tagged note once enabled", async () => {
    const { notes, setNote, provider, index } = await build();
    notes.seed(path);
    setNote(path);

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
    const { notes, setNote, provider, index } = await build();
    notes.seed(path);
    setNote(path, { frontmatterTags: ["#other"] });

    provider.start();

    expect(index.itemsIn(path)).toEqual([]);
  });

  it("does not take a note whose task tag sits only in its body", async () => {
    const { notes, setNote, provider, index } = await build();
    notes.seed(path);
    setNote(path, { frontmatterTags: [], bodyTags: ["#task"] });

    provider.start();

    expect(index.itemsIn(path)).toEqual([]);
  });

  it("keeps a note whose archive tag sits only in its body", async () => {
    const { notes, setNote, provider, index } = await build();
    notes.seed(path);
    setNote(path, { bodyTags: ["#archived"] });

    provider.start();

    expect(index.itemsIn(path)).toHaveLength(1);
  });

  it("drops the item when the tag is removed and follows a changed date", async () => {
    const { notes, setNote, provider, index } = await build();
    notes.seed(path);
    setNote(path);
    provider.start();

    setNote(path, { properties: { scheduled: "2026-11-02" } });
    notes.emitMetadataChanged(path);
    expect(index.itemsIn(path).at(0)?.dates.scheduled).toBe(anchor("2026-11-02"));

    setNote(path, { frontmatterTags: [] });
    notes.emitMetadataChanged(path);
    expect(index.itemsIn(path)).toEqual([]);
  });

  it("moves the item to the new path on rename", async () => {
    const { notes, setNote, provider, index } = await build();
    notes.seed(path);
    setNote(path);
    provider.start();

    setNote(moved);
    await notes.rename(path, moved);

    expect(index.itemsIn(path)).toEqual([]);
    expect(index.itemsIn(moved).map((item) => item.key)).toEqual(["note-property:Tasks/b.md"]);
  });

  it("removes the item when the note is deleted", async () => {
    const { notes, setNote, provider, index } = await build();
    notes.seed(path);
    setNote(path);
    provider.start();

    await notes.delete(path);

    expect(index.itemsIn(path)).toEqual([]);
  });

  it("republishes from the new property in one version bump when the slice is edited", async () => {
    const { notes, setNote, provider, index, slice } = await build();
    notes.seed(path);
    setNote(path, { properties: { scheduled: "2026-10-21", plan: "2026-12-01" } });
    provider.start();
    const before = index.version();

    slice.state.dates = { ...slice.state.dates, scheduled: "plan" };
    await nextTick();

    expect(index.itemsIn(path).at(0)?.dates.scheduled).toBe(anchor("2026-12-01"));
    expect(index.version()).toBe(before + 1);
  });

  it("clears every item in one version bump when disabled", async () => {
    const { notes, setNote, provider, index, slice } = await build();
    const other = "Tasks/c.md" as VaultPath;
    for (const target of [path, other]) {
      notes.seed(target);
      setNote(target);
    }
    provider.start();
    const before = index.version();

    slice.state.enabled = false;
    await nextTick();

    expect(index.itemsIn(path)).toEqual([]);
    expect(index.itemsIn(other)).toEqual([]);
    expect(index.version()).toBe(before + 1);
  });

  describe("setUp", () => {
    it("stays false while the provider has never been enabled", async () => {
      const { provider, slice } = await build(false);
      provider.start();
      await nextTick();

      expect(slice.state.setUp).toBe(false);
    });

    it("turns true the first time the provider is enabled, in the same version bump as its walk", async () => {
      const { notes, setNote, provider, index, slice } = await build(false);
      notes.seed(path);
      setNote(path);
      provider.start();
      const before = index.version();

      slice.state.enabled = true;
      await nextTick();

      expect(slice.state.setUp).toBe(true);
      expect(index.itemsIn(path)).toHaveLength(1);
      expect(index.version()).toBe(before + 1);
    });

    it("turns true at start when the stored slice is already enabled", async () => {
      const { provider, slice } = await build(true);
      provider.start();

      expect(slice.state.setUp).toBe(true);
    });

    it("stays true once the provider is disabled again", async () => {
      const { provider, slice } = await build(false);
      provider.start();
      slice.state.enabled = true;
      await nextTick();

      slice.state.enabled = false;
      await nextTick();

      expect(slice.state.setUp).toBe(true);
    });
  });

  it("stops reacting once its disposer runs", async () => {
    const { notes, setNote, provider, index, slice } = await build();
    notes.seed(path);
    setNote(path);
    const stop = provider.start();
    stop();

    slice.state.enabled = false;
    await nextTick();
    notes.emitMetadataChanged(path);

    expect(index.itemsIn(path)).toHaveLength(1);
  });
});
