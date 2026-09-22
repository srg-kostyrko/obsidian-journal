import { describe, expect, it, vi } from "vitest";

import type { VaultPath } from "@/infrastructure/host";
import { testContainer, type TestHarness } from "@/testing";

import { tasksCoreModule } from "./module";
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

// TaskIndex is resolved from a container rather than constructed directly: a later task gives it
// an injected dependency, and a test written against a bare constructor would have to be rewritten
// at that point.
async function build(): Promise<{ harness: TestHarness; index: TaskIndex }> {
  const harness = await testContainer({
    modules: [tasksCoreModule],
    overrides: [
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
