import { describe, expect, it } from "vitest";
import { nextTick } from "vue";

import { anchor } from "@/calendar/testing";
import { NoteStructureService, type NoteStructure, type VaultPath } from "@/infrastructure/host";
import { FakeNoteStructureService } from "@/infrastructure/host/testing";
import { Option } from "@/infrastructure/result";
import { JournalsIndex } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { SettingsService } from "@/settings";
import { overrideWith, testContainer } from "@/testing";

import { tasksCoreModule } from "../../module";
import { TaskIndex } from "../../task-index";
import { TaskHostToken, TaskProviderToken, type OwnedNote, type OwnedNoteChange, type TaskItem } from "../../types";

import { CHECKBOX_PROVIDER_ID } from "./extract";
import { CheckboxTaskProvider } from "./provider";
import { checkboxSlice } from "./slice";

const dayPath = "Daily/2026-09-22.md" as VaultPath;
const otherPath = "Daily/2026-09-23.md" as VaultPath;
const projectPath = "project/ideas.md" as VaultPath;

function structure(overrides: Partial<NoteStructure> = {}): NoteStructure {
  return {
    listItems: [{ marker: " ", line: 4, endLine: 4 }],
    tags: [],
    headings: [],
    frontmatterTags: [],
    ...overrides,
  };
}

// Hand-rolled rather than a fuller fake: four methods, and faking them keeps the provider's own
// fill/refill behavior the thing under test rather than the journals index's.
class FakeTaskHost {
  #listener: ((change: OwnedNoteChange) => void) | null = null;
  readonly published = new Map<VaultPath, readonly TaskItem[]>();
  readonly owned = new Map<VaultPath, OwnedNote>();

  readonly publishes: ("all" | VaultPath)[] = [];

  // Models the index's own replacement semantics for the "all" scope rather than ignoring it: a
  // full refill publishes once for every path at a time, so a fake that dropped it would read as
  // "nothing was published".
  publish(_providerId: string, scope: "all" | { path: VaultPath }, items: readonly TaskItem[]): void {
    this.publishes.push(scope === "all" ? "all" : scope.path);
    if (scope !== "all") {
      this.published.set(scope.path, items);
      return;
    }
    this.published.clear();
    for (const path of this.owned.keys()) this.published.set(path, []);
    for (const item of items) this.published.set(item.path, [...(this.published.get(item.path) ?? []), item]);
  }

  *ownedNotes(_providerId: string, journalName?: string): Iterable<OwnedNote> {
    for (const note of this.owned.values()) {
      if (journalName === undefined || note.journalName === journalName) yield note;
    }
  }

  ownerOf(path: VaultPath, _providerId: string): Option<OwnedNote> {
    const hit = this.owned.get(path);
    return hit ? Option.some(hit) : Option.none<OwnedNote>();
  }

  onOwnedNotesChanged(callback: (change: OwnedNoteChange) => void): () => void {
    this.#listener = callback;
    return () => {
      this.#listener = null;
    };
  }

  emit(change: OwnedNoteChange): void {
    this.#listener?.(change);
  }
}

async function build(sliceState: Record<string, unknown> = {}) {
  const host = new FakeTaskHost();
  const structures = new FakeNoteStructureService();
  const harness = await testContainer({
    modules: [tasksCoreModule],
    data: { tasksCheckbox: sliceState },
    overrides: [overrideWith(TaskHostToken, host as never), overrideWith(NoteStructureService, structures as never)],
  });
  const provider = harness.resolve(TaskProviderToken).find((candidate) => candidate.id === CHECKBOX_PROVIDER_ID);
  if (!(provider instanceof CheckboxTaskProvider)) throw new Error("checkbox provider not registered");
  return { host, structures, provider, harness };
}

describe("CheckboxTaskProvider", () => {
  it("fills the index for every owned note when started", async () => {
    const { host, structures, provider } = await build();
    host.owned.set(dayPath, { path: dayPath, journalName: "Daily", rule: undefined });
    host.owned.set(otherPath, { path: otherPath, journalName: "Daily", rule: undefined });
    structures.setStructure(dayPath, structure());
    structures.setStructure(otherPath, structure());

    provider.start();

    expect(host.published.get(dayPath)).toHaveLength(1);
    expect(host.published.get(otherPath)).toHaveLength(1);
  });

  it("ships enabled by default, with an empty rule matching every list item", async () => {
    const { host, structures, provider } = await build();
    host.owned.set(dayPath, { path: dayPath, journalName: "Daily", rule: undefined });
    structures.setStructure(dayPath, structure());

    provider.start();

    expect(host.published.get(dayPath)).toHaveLength(1);
  });

  it("publishes nothing while disabled", async () => {
    const { host, structures, provider } = await build({ enabled: false });
    host.owned.set(dayPath, { path: dayPath, journalName: "Daily", rule: undefined });
    structures.setStructure(dayPath, structure());

    provider.start();

    expect(host.published.get(dayPath)).toEqual([]);
  });

  it("refills one note when that note changes", async () => {
    const { host, structures, provider } = await build();
    host.owned.set(dayPath, { path: dayPath, journalName: "Daily", rule: undefined });
    structures.setStructure(dayPath, structure({ listItems: [] }));
    provider.start();
    expect(host.published.get(dayPath)).toEqual([]);

    structures.setStructure(dayPath, structure());
    host.emit({ kind: "note", path: dayPath });

    expect(host.published.get(dayPath)).toHaveLength(1);
  });

  it("clears a note's items once the note is no longer owned", async () => {
    const { host, structures, provider } = await build();
    host.owned.set(dayPath, { path: dayPath, journalName: "Daily", rule: undefined });
    structures.setStructure(dayPath, structure());
    provider.start();
    expect(host.published.get(dayPath)).toHaveLength(1);

    host.owned.delete(dayPath);
    host.emit({ kind: "note", path: dayPath });

    expect(host.published.get(dayPath)).toEqual([]);
  });

  it("refills a journal's notes when its rule changes, leaving other journals alone", async () => {
    const { host, structures, provider } = await build();
    host.owned.set(dayPath, { path: dayPath, journalName: "Daily", rule: undefined });
    host.owned.set(projectPath, { path: projectPath, journalName: "Other", rule: undefined });
    structures.setStructure(dayPath, structure());
    structures.setStructure(projectPath, structure());
    provider.start();
    host.published.clear();

    host.emit({ kind: "journal", journalName: "Daily" });

    expect(host.published.has(dayPath)).toBe(true);
    expect(host.published.has(projectPath)).toBe(false);
  });

  it("refills a journal's notes as soon as its rule changes", async () => {
    const { host, structures, provider } = await build();
    host.owned.set(dayPath, { path: dayPath, journalName: "Daily", rule: undefined });
    structures.setStructure(dayPath, structure());
    provider.start();
    host.published.clear();

    host.emit({ kind: "journal", journalName: "Daily" });

    expect(host.published.has(dayPath)).toBe(true);
  });

  // A journal deletion shrinks the owned set with no per-note event of its own. A journal-scoped
  // refill cannot clear it — it walks the notes that journal still owns, which is none — so the
  // items only go when a full refill replaces the provider's whole store.
  it("drops a vanished journal's items on a full refill", async () => {
    const { host, structures, provider } = await build();
    host.owned.set(dayPath, { path: dayPath, journalName: "Daily", rule: undefined });
    host.owned.set(projectPath, { path: projectPath, journalName: "Other", rule: undefined });
    structures.setStructure(dayPath, structure());
    structures.setStructure(projectPath, structure());
    provider.start();
    expect(host.published.get(dayPath)).toHaveLength(1);

    host.owned.delete(dayPath);
    host.emit({ kind: "all" });

    expect(host.published.has(dayPath)).toBe(false);
    expect(host.published.get(projectPath)).toHaveLength(1);
  });

  it("applies the owning journal's rule rather than the global one under replace", async () => {
    const { host, structures, provider } = await build({
      rule: { mode: "and", conditions: [{ type: "tag", condition: "has", tags: ["#task"] }] },
    });
    host.owned.set(dayPath, {
      path: dayPath,
      journalName: "Daily",
      rule: { compose: "replace", mode: "and", conditions: [] },
    });
    structures.setStructure(dayPath, structure());

    provider.start();

    expect(host.published.get(dayPath)).toHaveLength(1);
  });

  it("falls back to the global rule when a journal rule cannot be parsed", async () => {
    const { host, structures, provider } = await build({
      rule: { mode: "and", conditions: [{ type: "tag", condition: "has", tags: ["#task"] }] },
    });
    // Not a schema failure the way `undefined` or a non-object would be repaired by v.fallback —
    // a bogus condition `type` breaks the discriminated union outright, with no fallback to repair
    // it, so this is a genuine parse failure rather than a defaulted-and-therefore-passing value.
    host.owned.set(dayPath, {
      path: dayPath,
      journalName: "Daily",
      rule: { conditions: [{ type: "bogus" }] },
    });
    structures.setStructure(dayPath, structure());

    provider.start();

    expect(host.published.get(dayPath)).toEqual([]);
  });

  it("stops publishing after its disposer runs", async () => {
    const { host, structures, provider } = await build();
    host.owned.set(dayPath, { path: dayPath, journalName: "Daily", rule: undefined });
    structures.setStructure(dayPath, structure());
    provider.start()();
    host.published.clear();

    host.emit({ kind: "note", path: dayPath });

    expect(host.published.size).toBe(0);
  });

  // The addition this task makes over the rest of the suite: settings toggled through the
  // dashboard must reach the index immediately. Nothing here emits a note or journal event — the
  // refill has to come from the provider's own settings watch, or this stays stale until some
  // unrelated event happens to fire.
  it("refills every owned note when its own settings change, without any note or journal event", async () => {
    const { host, structures, provider, harness } = await build();
    host.owned.set(dayPath, { path: dayPath, journalName: "Daily", rule: undefined });
    structures.setStructure(dayPath, structure());
    provider.start();
    expect(host.published.get(dayPath)).toHaveLength(1);

    const slice = harness.resolve(SettingsService).getSlice(checkboxSlice);
    slice.state.enabled = false;
    await nextTick();

    expect(host.published.get(dayPath)).toEqual([]);

    slice.state.enabled = true;
    await nextTick();

    expect(host.published.get(dayPath)).toHaveLength(1);
  });

  // A full refill replaces the provider's whole store, so it goes out as one "all" publish: per-note
  // publishing bumps the index version once per note and makes every consumer recompute that often.
  it("refills every owned note in a single publish", async () => {
    const { host, structures, provider } = await build();
    host.owned.set(dayPath, { path: dayPath, journalName: "Daily", rule: undefined });
    host.owned.set(otherPath, { path: otherPath, journalName: "Daily", rule: undefined });
    structures.setStructure(dayPath, structure());
    structures.setStructure(otherPath, structure());
    provider.start();

    expect(host.publishes).toEqual(["all"]);
    expect(host.published.get(dayPath)).toHaveLength(1);
    expect(host.published.get(otherPath)).toHaveLength(1);
  });

  it("stops reacting to settings once its disposer runs", async () => {
    const { host, structures, provider, harness } = await build();
    host.owned.set(dayPath, { path: dayPath, journalName: "Daily", rule: undefined });
    structures.setStructure(dayPath, structure());
    provider.start()();
    host.published.clear();
    host.publishes.length = 0;

    const slice = harness.resolve(SettingsService).getSlice(checkboxSlice);
    slice.state.enabled = false;
    await nextTick();

    expect(host.publishes).toEqual([]);
  });
});

describe("CheckboxTaskProvider.hydrateItem", () => {
  const path = "a.md" as VaultPath;
  function lineItem(): TaskItem {
    return {
      provider: CHECKBOX_PROVIDER_ID,
      key: `${path}:0`,
      path,
      status: "todo",
      relations: ["containment"],
      capabilities: { movable: true, stampable: true, retargetable: false },
      display: { kind: "line", path, line: 0, endLine: 0, markdown: null },
      dates: {},
    };
  }

  it("fills markdown, dates and retargetable from the line's text", async () => {
    const { provider } = await build();
    const hydrated = provider.hydrateItem(lineItem(), "- [ ] Water plants 📅 2026-09-25");
    expect(hydrated.display).toMatchObject({ markdown: "- [ ] Water plants 📅 2026-09-25" });
    expect(hydrated.dates.due).toBe("2026-09-25");
    expect(hydrated.capabilities.retargetable).toBe(true);
  });

  it("leaves retargetable false and dates empty when the line carries no date signifier", async () => {
    const { provider } = await build();
    const hydrated = provider.hydrateItem(lineItem(), "- [ ] Water plants");
    expect(hydrated.dates).toEqual({});
    expect(hydrated.capabilities.retargetable).toBe(false);
  });

  it("leaves a note-display item untouched, never reading display fields that don't exist on it", async () => {
    const { provider } = await build();
    const noteItem: TaskItem = { ...lineItem(), display: { kind: "note", path, title: "Ideas" } };
    expect(provider.hydrateItem(noteItem, "irrelevant")).toBe(noteItem);
  });
});

// Proves the wiring, not just the method: TaskIndex resolves hydrateItem from the provider it
// finds under TaskProviderToken by id, so this exercises the real DI registration end to end. If
// CheckboxTaskProvider never implemented hydrateItem, TaskIndex.hydrate would silently fall back
// to setting markdown alone, and this is the test that would catch it — a checkbox item's dates
// would come back empty with no error anywhere.
describe("CheckboxTaskProvider hydration wiring", () => {
  it("hydrates a real checkbox item through TaskIndex with dates and retargetable set", async () => {
    const structures = new FakeNoteStructureService();
    const path = "Daily/2026-09-22.md" as VaultPath;
    const harness = await testContainer({
      modules: [journalsCoreModule, tasksCoreModule],
      data: { journals: { Daily: fixedJournal("Daily", { type: "day" }) } },
      overrides: [overrideWith(NoteStructureService, structures as never)],
    });
    const journals = harness.resolve(JournalsIndex);
    journals.register({ journalName: "Daily", anchor: anchor("2026-09-22"), path });
    structures.setStructure(path, structure({ listItems: [{ marker: " ", line: 4, endLine: 4 }] }));
    harness.host.putFile(path, "one\ntwo\nthree\nfour\n- [ ] Water plants 📅 2026-09-25\n");

    const provider = harness.resolve(TaskProviderToken).find((candidate) => candidate.id === CHECKBOX_PROVIDER_ID);
    if (!provider) throw new Error("checkbox provider not registered");
    provider.start();

    const index = harness.resolve(TaskIndex);
    const published = index.itemsIn(path);
    expect(published).toHaveLength(1);

    const hydrated = await index.hydrate(published);
    expect(hydrated.at(0)?.display).toMatchObject({ markdown: "- [ ] Water plants 📅 2026-09-25" });
    expect(hydrated.at(0)?.dates.due).toBe("2026-09-25");
    expect(hydrated.at(0)?.capabilities.retargetable).toBe(true);
  });
});

// The refill trigger no other test covers: ticking a checkbox changes neither the note's slot nor
// the frontmatter payload JournalsIndex compares, so `register` returns without emitting
// entryChanged. Driven through the real TaskHostService rather than the fake host above, because
// what is under test is which host event reaches the provider at all.
describe("CheckboxTaskProvider content refill", () => {
  it("re-extracts a note whose parse changed, with no ownership or settings event", async () => {
    const structures = new FakeNoteStructureService();
    const path = "Daily/2026-09-22.md" as VaultPath;
    const harness = await testContainer({
      modules: [journalsCoreModule, tasksCoreModule],
      data: { journals: { Daily: fixedJournal("Daily", { type: "day" }) } },
      overrides: [overrideWith(NoteStructureService, structures as never)],
    });
    harness.host.putFile(path);
    harness.resolve(JournalsIndex).register({ journalName: "Daily", anchor: anchor("2026-09-22"), path });
    structures.setStructure(path, structure({ listItems: [] }));

    const provider = harness.resolve(TaskProviderToken).find((candidate) => candidate.id === CHECKBOX_PROVIDER_ID);
    if (!provider) throw new Error("checkbox provider not registered");
    provider.start();

    const index = harness.resolve(TaskIndex);
    expect(index.itemsIn(path)).toEqual([]);

    structures.setStructure(path, structure({ listItems: [{ marker: " ", line: 4, endLine: 4 }] }));
    harness.host.emitMetadata(path);

    expect(index.itemsIn(path)).toHaveLength(1);
  });

  // The other half of that subscription: it fires for every edit to every owned note, and every
  // consumer reseeds off the index version. A note whose checkboxes did not move — or that holds
  // none at all — must leave the version where it was, or an ordinary note edit re-runs
  // evaluateRange over every period on every mounted surface.
  it("leaves the index version alone when an edit changes none of the note's items", async () => {
    const structures = new FakeNoteStructureService();
    const path = "Daily/2026-09-22.md" as VaultPath;
    const harness = await testContainer({
      modules: [journalsCoreModule, tasksCoreModule],
      data: { journals: { Daily: fixedJournal("Daily", { type: "day" }) } },
      overrides: [overrideWith(NoteStructureService, structures as never)],
    });
    harness.host.putFile(path);
    harness.resolve(JournalsIndex).register({ journalName: "Daily", anchor: anchor("2026-09-22"), path });
    structures.setStructure(path, structure());

    const provider = harness.resolve(TaskProviderToken).find((candidate) => candidate.id === CHECKBOX_PROVIDER_ID);
    if (!provider) throw new Error("checkbox provider not registered");
    provider.start();

    const index = harness.resolve(TaskIndex);
    const before = index.version();

    harness.host.emitMetadata(path);
    harness.host.emitMetadata(path);

    expect(index.version()).toBe(before);
  });
});
