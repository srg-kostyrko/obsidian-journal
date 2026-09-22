import { describe, expect, it, vi } from "vitest";

import type { VaultPath } from "@/infrastructure/host";
import { testContainer, type TestHarness } from "@/testing";

import { datesIn } from "./providers/checkbox/dates";
import { TaskIndex } from "./task-index";
import { TaskProviderToken, type TaskItem, type TaskProvider } from "./types";

// TaskProvider.start returns a disposer; these stand-in providers never actually start, so the
// disposer is never called, but the interface still requires one.
function noDisposer(): void {
  /* never started */
}

// TaskIndex resolves providers from TaskProviderToken (a DI multi-token), so a test proving
// dialect-aware hydration registers its own stand-in provider here rather than reaching for the
// real CheckboxTaskProvider — that class comes with host/settings wiring a later task owns, and
// none of it bears on whether TaskIndex.hydrate correctly delegates to whatever is registered.
// Its hydrateItem reuses the real datesIn, so the fixtures below still exercise real dialect logic.
const checkboxTestProvider: TaskProvider = {
  id: "checkbox",
  start: () => noDisposer,
  hydrateItem(item, markdown) {
    if (item.display.kind !== "line") return item;
    const dates = datesIn(markdown);
    return {
      ...item,
      dates,
      capabilities: { ...item.capabilities, retargetable: Object.keys(dates).length > 0 },
      display: { ...item.display, markdown },
    };
  },
};

const bareTestProvider: TaskProvider = {
  id: "bare",
  start: () => noDisposer,
};

// TaskIndex is resolved from a container rather than constructed directly: it has an injected
// dependency, and a test written against a bare constructor would have to be rewritten if that
// changes. Registered directly rather than through tasksCoreModule: that module also carries the
// real CheckboxTaskProvider under the same TaskProviderToken multi-token, and multi-registrations
// are additive — loading it here would leave two providers answering to id "checkbox", with
// #find() picking whichever registered first rather than the stand-in this file seeds.
async function build(): Promise<{ harness: TestHarness; index: TaskIndex }> {
  const harness = await testContainer({
    overrides: [
      (c) => c.register(TaskIndex).useClass(TaskIndex),
      (c) => c.register(TaskProviderToken).useValue(checkboxTestProvider),
      (c) => c.register(TaskProviderToken).useValue(bareTestProvider),
    ],
  });
  return { harness, index: harness.resolve(TaskIndex) };
}

const path = "a.md" as VaultPath;
function item(key: string, provider = "checkbox"): TaskItem {
  return {
    provider,
    key,
    path,
    status: "todo",
    relations: ["containment"],
    capabilities: { movable: true, stampable: true, retargetable: false },
    display: { kind: "line", path, line: 1, endLine: 1, markdown: null },
    dates: {},
  };
}

function lineItem(key: string, line: number, provider = "checkbox", endLine = line): TaskItem {
  return {
    provider,
    key,
    path,
    status: "todo",
    relations: ["containment"],
    capabilities: { movable: true, stampable: true, retargetable: false },
    display: { kind: "line", path, line, endLine, markdown: null },
    dates: {},
  };
}

describe("TaskIndex", () => {
  it("returns nothing for an unknown path", async () => {
    const { index } = await build();
    expect(index.itemsIn(path)).toEqual([]);
  });

  it("stores what a provider publishes for a path", async () => {
    const { index } = await build();
    index.publish("checkbox", { path }, [item("a.md:1")]);
    expect(index.itemsIn(path)).toHaveLength(1);
  });

  it("replaces that provider's items for the path, leaving other providers alone", async () => {
    const { index } = await build();
    index.publish("checkbox", { path }, [item("a.md:1")]);
    index.publish("other", { path }, [item("a.md", "other")]);
    index.publish("checkbox", { path }, []);
    expect(index.itemsIn(path).map((i) => i.provider)).toEqual(["other"]);
  });

  it("deduplicates by provider and key", async () => {
    const { index } = await build();
    index.publish("checkbox", { path }, [item("a.md:1"), item("a.md:1")]);
    expect(index.itemsIn(path)).toHaveLength(1);
  });

  it("keeps the last occurrence when a provider republishes the same key in one call", async () => {
    const { index } = await build();
    const first = item("a.md:1");
    const second: TaskItem = { ...first, status: "done" };
    index.publish("checkbox", { path }, [first, second]);
    expect(index.itemsIn(path)).toEqual([second]);
  });

  it("keeps items from two different providers that share the same key", async () => {
    const { index } = await build();
    index.publish("checkbox", { path }, [item("shared", "checkbox")]);
    index.publish("other", { path }, [item("shared", "other")]);
    expect(
      index
        .itemsIn(path)
        .map((i) => i.provider)
        .toSorted(),
    ).toEqual(["checkbox", "other"]);
  });

  it("bumps the version and announces every publish", async () => {
    const { index } = await build();
    const seen = vi.fn();
    index.events.on("changed", seen);
    const before = index.version();
    index.publish("checkbox", { path }, [item("a.md:1")]);
    expect(index.version()).toBeGreaterThan(before);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("clears a provider's whole contribution on an 'all' publish", async () => {
    const { index } = await build();
    index.publish("checkbox", { path }, [item("a.md:1")]);
    index.publish("checkbox", "all", []);
    expect(index.itemsIn(path)).toEqual([]);
  });

  it("leaves another provider's items untouched by an 'all' publish", async () => {
    const { index } = await build();
    const survivor = item("a.md", "other");
    index.publish("checkbox", { path }, [item("a.md:1")]);
    index.publish("other", { path }, [survivor]);
    index.publish("checkbox", "all", []);
    expect(index.itemsIn(path)).toEqual([survivor]);
  });

  // Every consumer of the index reseeds off the version: use-cell-decorations reads it inside a
  // watchEffect, so one bump re-runs rebuildScopeMaps and evaluateRange over every period on every
  // mounted calendar, timeline and nav surface. The provider republishes a path on every
  // metadata-changed for a note it owns — including notes holding no checkboxes at all — so
  // without this an ordinary note edit reseeds the whole UI.
  it("does not bump the version or announce when a path's items come back unchanged", async () => {
    const { index } = await build();
    index.publish("checkbox", { path }, [item("a")]);
    const before = index.version();
    const seen = vi.fn();
    index.events.on("changed", seen);

    index.publish("checkbox", { path }, [item("a")]);

    expect(index.version()).toBe(before);
    expect(seen).not.toHaveBeenCalled();
  });

  // The comparison has to see past the item's identity: same provider, same key, same line —
  // only the status moved. A guard keyed on the item set's shape alone would swallow a tick.
  it("bumps when the same key comes back with a different status", async () => {
    const { index } = await build();
    index.publish("checkbox", { path }, [item("a")]);
    const before = index.version();
    const seen = vi.fn();
    index.events.on("changed", seen);

    index.publish("checkbox", { path }, [{ ...item("a"), status: "done" }]);

    expect(index.version()).toBeGreaterThan(before);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("bumps when an unchanged key's line has moved", async () => {
    const { index } = await build();
    index.publish("checkbox", { path }, [lineItem("a", 1)]);
    const before = index.version();

    index.publish("checkbox", { path }, [
      { ...lineItem("a", 1), display: { kind: "line", path, line: 9, endLine: 9, markdown: null } },
    ]);

    expect(index.version()).toBeGreaterThan(before);
  });

  it("does not bump when an 'all' publish restates the same store", async () => {
    const { index } = await build();
    index.publish("checkbox", "all", [item("a"), item("b")]);
    const before = index.version();
    const seen = vi.fn();
    index.events.on("changed", seen);

    index.publish("checkbox", "all", [item("a"), item("b")]);

    expect(index.version()).toBe(before);
    expect(seen).not.toHaveBeenCalled();
  });

  it("bumps when an 'all' publish drops a path the provider used to hold", async () => {
    const { index } = await build();
    const otherPath = "b.md" as VaultPath;
    index.publish("checkbox", "all", [item("a"), { ...item("b"), path: otherPath }]);
    const before = index.version();

    index.publish("checkbox", "all", [item("a")]);

    expect(index.version()).toBeGreaterThan(before);
    expect(index.itemsIn(otherPath)).toEqual([]);
  });

  it("keeps events read-only — a consumer cannot emit through the public handle", async () => {
    const { index } = await build();
    const seen = vi.fn();
    const unsubscribe = index.events.on("changed", seen);
    index.publish("checkbox", { path }, [item("a.md:1")]);
    expect(seen).toHaveBeenCalledTimes(1);
    unsubscribe();
    // @ts-expect-error -- events is Subscribable<TaskIndexEvents>, which exposes only `on`. A
    // public `emit` would let a consumer fire "changed" with no matching version() bump.
    type HasEmit = typeof index.events.emit;
    const pinned: HasEmit = undefined;
    expect(pinned).toBeUndefined();
  });
});

describe("TaskIndex.hydrate", () => {
  it("fills markdown for a line item from the note's text", async () => {
    const { harness, index } = await build();
    harness.host.putFile(path, "intro\n- [ ] Water plants\n");
    const hydrated = await index.hydrate([lineItem("a.md:1", 1)]);
    expect(hydrated.at(0)?.display).toMatchObject({ markdown: "- [ ] Water plants" });
  });

  it("reads a note once while its mtime holds", async () => {
    const { harness, index } = await build();
    const file = harness.host.putFile(path, "- [ ] One\n");
    const spy = vi.spyOn(harness.host.app.vault, "cachedRead");
    await index.hydrate([lineItem("a.md:0", 0)]);
    await index.hydrate([lineItem("a.md:0", 0)]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(file).toBeDefined();
  });

  it("re-reads after the note's mtime moves", async () => {
    const { harness, index } = await build();
    const file = harness.host.putFile(path, "- [ ] One\n");
    const spy = vi.spyOn(harness.host.app.vault, "cachedRead");
    await index.hydrate([lineItem("a.md:0", 0)]);
    file.stat.mtime += 1000;
    await index.hydrate([lineItem("a.md:0", 0)]);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("leaves markdown null when the note has gone", async () => {
    const { index } = await build();
    const hydrated = await index.hydrate([lineItem("gone.md:0", 0)]);
    expect(hydrated.at(0)?.display).toMatchObject({ markdown: null });
  });

  it("leaves markdown null when a previously cached note is deleted before the next hydrate", async () => {
    const { harness, index } = await build();
    const file = harness.host.putFile(path, "- [ ] One\n");
    const first = await index.hydrate([lineItem("a.md:0", 0)]);
    expect(first.at(0)?.display).toMatchObject({ markdown: "- [ ] One" });

    await harness.host.app.fileManager.trashFile(file);

    const second = await index.hydrate([lineItem("a.md:0", 0)]);
    expect(second.at(0)?.display).toMatchObject({ markdown: null });
  });

  // A published item outlives the text it points at by one edit: the note shrinks, the item's line
  // is now past end-of-file, and slicing there yields "" rather than undefined. Marking it hydrated
  // with empty markdown is worse than leaving it null — nothing would ever re-read it.
  it("leaves markdown null when the item's line no longer exists in the note", async () => {
    const { harness, index } = await build();
    harness.host.putFile(path, "- [ ] One\n");
    const hydrated = await index.hydrate([lineItem("a.md:7", 7)]);
    expect(hydrated.at(0)?.display).toMatchObject({ markdown: null });
    expect(hydrated.at(0)?.capabilities.retargetable).toBe(false);
  });

  it("marks a hydrated line retargetable only when it carries a date signifier", async () => {
    const { harness, index } = await build();
    harness.host.putFile(path, "- [ ] Dated 📅 2026-09-25\n- [ ] Plain\n");
    const hydrated = await index.hydrate([lineItem("a.md:0", 0), lineItem("a.md:1", 1)]);
    expect(hydrated.at(0)?.capabilities.retargetable).toBe(true);
    expect(hydrated.at(0)?.dates.due).toBe("2026-09-25");
    expect(hydrated.at(1)?.capabilities.retargetable).toBe(false);
    expect(hydrated.at(1)?.dates).toEqual({});
  });

  it("joins every line in a multi-line span, not just the first", async () => {
    const { harness, index } = await build();
    harness.host.putFile(path, "before\n- [ ] Water plants\n  every morning\n  before work\nafter\n");
    const hydrated = await index.hydrate([lineItem("a.md:1", 1, "checkbox", 3)]);
    expect(hydrated.at(0)?.display).toMatchObject({
      markdown: "- [ ] Water plants\n  every morning\n  before work",
    });
  });

  it("leaves dates and retargetable untouched when no provider is registered for the item's id", async () => {
    const { harness, index } = await build();
    harness.host.putFile(path, "- [ ] Dated 📅 2026-09-25\n");
    const hydrated = await index.hydrate([lineItem("a.md:0", 0, "unregistered")]);
    expect(hydrated.at(0)?.display).toMatchObject({ markdown: "- [ ] Dated 📅 2026-09-25" });
    expect(hydrated.at(0)?.dates).toEqual({});
    expect(hydrated.at(0)?.capabilities.retargetable).toBe(false);
  });

  it("leaves dates and retargetable untouched when the matched provider declares no hydrateItem", async () => {
    const { harness, index } = await build();
    harness.host.putFile(path, "- [ ] Dated 📅 2026-09-25\n");
    const hydrated = await index.hydrate([lineItem("a.md:0", 0, "bare")]);
    expect(hydrated.at(0)?.display).toMatchObject({ markdown: "- [ ] Dated 📅 2026-09-25" });
    expect(hydrated.at(0)?.dates).toEqual({});
    expect(hydrated.at(0)?.capabilities.retargetable).toBe(false);
  });
});
