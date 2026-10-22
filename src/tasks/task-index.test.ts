import { describe, expect, it, vi } from "vitest";

import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";
import { testContainer, type TestHarness } from "@/testing";

import { TaskIndex } from "./task-index";

import type { TaskDateRole, TaskItem } from "./types";

// Resolved from a container rather than constructed directly: TaskIndex has an injected
// dependency, and a test written against a bare constructor would have to be rewritten if that
// changes.
async function build(): Promise<{ harness: TestHarness; index: TaskIndex }> {
  const harness = await testContainer({
    overrides: [(c) => c.register(TaskIndex).useClass(TaskIndex)],
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
    display: { kind: "line", path, line: 1, endLine: 1, parentLine: null, markdown: null },
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
    display: { kind: "line", path, line, endLine, parentLine: null, markdown: null },
    dates: {},
  };
}

const day = (s: string): AnchorString => s as AnchorString;
const octoberDay = (seed: number): string => `2026-10-${String(10 + (seed % 20)).padStart(2, "0")}`;

function dated(
  key: string,
  dates: Partial<Record<TaskDateRole, string>>,
  relations: TaskItem["relations"] = ["date"],
): TaskItem {
  return {
    ...item(key, "note-property"),
    relations,
    dates: Object.fromEntries(Object.entries(dates).map(([role, value]) => [role, day(value)])),
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
      { ...lineItem("a", 1), display: { kind: "line", path, line: 9, endLine: 9, parentLine: null, markdown: null } },
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

  // Dates are the provider's to read at fill time; hydration parsing them again could disagree
  // with the relation the item was indexed under.
  it("fills markdown but leaves dates and retargetable as the item was published", async () => {
    const { harness, index } = await build();
    harness.host.putFile(path, "- [ ] Dated 📅 2026-09-26\n- [ ] Plain 📅 2026-09-25\n");
    const published: TaskItem = {
      ...lineItem("a.md:0", 0),
      relations: ["containment", "date"],
      capabilities: { movable: true, stampable: true, retargetable: true },
      dates: { due: day("2026-09-25") },
    };
    const hydrated = await index.hydrate([published, lineItem("a.md:1", 1)]);
    expect(hydrated.at(0)?.display).toMatchObject({ markdown: "- [ ] Dated 📅 2026-09-26" });
    expect(hydrated.at(0)?.dates).toEqual({ due: "2026-09-25" });
    expect(hydrated.at(0)?.capabilities.retargetable).toBe(true);
    expect(hydrated.at(1)?.display).toMatchObject({ markdown: "- [ ] Plain 📅 2026-09-25" });
    expect(hydrated.at(1)?.dates).toEqual({});
    expect(hydrated.at(1)?.capabilities.retargetable).toBe(false);
  });

  it("joins every line in a multi-line span, not just the first", async () => {
    const { harness, index } = await build();
    harness.host.putFile(path, "before\n- [ ] Water plants\n  every morning\n  before work\nafter\n");
    const hydrated = await index.hydrate([lineItem("a.md:1", 1, "checkbox", 3)]);
    expect(hydrated.at(0)?.display).toMatchObject({
      markdown: "- [ ] Water plants\n  every morning\n  before work",
    });
  });

  describe("datedIn", () => {
    const roles = ["scheduled", "due"] as const;

    it("returns an item once when both roles fall in range", async () => {
      const { index } = await build();
      index.publish("note-property", { path }, [dated("n:1", { scheduled: "2026-10-20", due: "2026-10-30" })]);
      expect(index.datedIn(roles, day("2026-10-19"), day("2026-10-25")).map((i) => i.key)).toEqual(["n:1"]);
      expect(index.datedIn(roles, day("2026-10-19"), day("2026-10-31")).map((i) => i.key)).toEqual(["n:1"]);
    });

    it("includes both bounds and excludes outside", async () => {
      const { index } = await build();
      index.publish("note-property", { path }, [
        dated("n:in-start", { due: "2026-10-19" }),
        dated("n:in-end", { due: "2026-10-25" }),
        dated("n:out", { due: "2026-10-26" }),
        dated("n:before", { due: "2026-10-18" }),
      ]);
      expect(index.datedIn(roles, day("2026-10-19"), day("2026-10-25")).map((i) => i.key)).toEqual([
        "n:in-start",
        "n:in-end",
      ]);
    });

    it("ignores roles that were not asked for", async () => {
      const { index } = await build();
      index.publish("note-property", { path }, [dated("n:1", { start: "2026-10-20" })]);
      expect(index.datedIn(roles, day("2026-10-19"), day("2026-10-25"))).toEqual([]);
    });

    it("skips items without the date relation", async () => {
      const { index } = await build();
      index.publish("checkbox", { path }, [dated("c:1", { due: "2026-10-20" }, ["containment"])]);
      expect(index.datedIn(roles, day("2026-10-19"), day("2026-10-25"))).toEqual([]);
    });

    it("orders by matched date then key", async () => {
      const { index } = await build();
      index.publish("note-property", { path }, [
        dated("n:b", { due: "2026-10-20" }),
        dated("n:a", { due: "2026-10-20" }),
        dated("n:c", { scheduled: "2026-10-19", due: "2026-10-24" }),
      ]);
      expect(index.datedIn(roles, day("2026-10-19"), day("2026-10-25")).map((i) => i.key)).toEqual([
        "n:c",
        "n:a",
        "n:b",
      ]);
    });

    it("reflects a publish that moves a date out of range", async () => {
      const { index } = await build();
      index.publish("note-property", { path }, [dated("n:1", { due: "2026-10-20" })]);
      expect(index.datedIn(roles, day("2026-10-19"), day("2026-10-25"))).toHaveLength(1);
      index.publish("note-property", { path }, [dated("n:1", { due: "2026-11-20" })]);
      expect(index.datedIn(roles, day("2026-10-19"), day("2026-10-25"))).toEqual([]);
      expect(index.datedIn(roles, day("2026-11-19"), day("2026-11-25"))).toHaveLength(1);
    });

    it("reflects a full republish after a range was asked about", async () => {
      const { index } = await build();
      index.publish("note-property", "all", [dated("n:1", { due: "2026-10-20" })]);
      expect(index.datedIn(roles, day("2026-10-19"), day("2026-10-25"))).toHaveLength(1);
      index.publish("note-property", "all", [dated("n:1", { due: "2026-11-20" })]);
      expect(index.datedIn(roles, day("2026-10-19"), day("2026-10-25"))).toEqual([]);
      expect(index.datedIn(roles, day("2026-11-19"), day("2026-11-25"))).toHaveLength(1);
    });

    it("drops a removed item from a range already asked about", async () => {
      const { index } = await build();
      index.publish("note-property", { path }, [
        dated("n:1", { due: "2026-10-20" }),
        dated("n:2", { due: "2026-10-21" }),
      ]);
      expect(index.datedIn(roles, day("2026-10-19"), day("2026-10-25"))).toHaveLength(2);
      index.publish("note-property", { path }, [dated("n:2", { due: "2026-10-21" })]);
      expect(index.datedIn(roles, day("2026-10-19"), day("2026-10-25")).map((i) => i.key)).toEqual(["n:2"]);
      expect(index.datedIn(roles, day("2026-10-20"), day("2026-10-20"))).toEqual([]);
    });

    it("places a date first seen after a query between the dates around it", async () => {
      const { index } = await build();
      index.publish("note-property", { path }, [
        dated("n:1", { due: "2026-10-19" }),
        dated("n:3", { due: "2026-10-25" }),
      ]);
      expect(index.datedIn(roles, day("2026-10-19"), day("2026-10-25"))).toHaveLength(2);
      index.publish("note-property", { path }, [
        dated("n:1", { due: "2026-10-19" }),
        dated("n:2", { due: "2026-10-22" }),
        dated("n:3", { due: "2026-10-25" }),
      ]);
      expect(index.datedIn(roles, day("2026-10-19"), day("2026-10-25")).map((i) => i.key)).toEqual([
        "n:1",
        "n:2",
        "n:3",
      ]);
      expect(index.datedIn(roles, day("2026-10-22"), day("2026-10-22")).map((i) => i.key)).toEqual(["n:2"]);
    });

    it("keeps another note's and another provider's items when one note changes", async () => {
      const { index } = await build();
      const other = "b.md" as VaultPath;
      index.publish("note-property", { path }, [dated("n:1", { due: "2026-10-20" })]);
      index.publish("checkbox", { path }, [{ ...dated("c:1", { due: "2026-10-20" }), provider: "checkbox" }]);
      index.publish("note-property", { path: other }, [{ ...dated("b:1", { due: "2026-10-20" }), path: other }]);
      expect(index.datedIn(roles, day("2026-10-20"), day("2026-10-20"))).toHaveLength(3);
      index.publish("note-property", { path }, []);
      expect(index.datedIn(roles, day("2026-10-20"), day("2026-10-20")).map((i) => i.key)).toEqual(["b:1", "c:1"]);
    });

    it("answers after a run of edits exactly as an index built from the final state", async () => {
      const { index } = await build();
      const paths = ["a.md", "b.md", "c.md"] as VaultPath[];
      const publishFor = (target: TaskIndex, p: VaultPath, step: number) => {
        const items = Array.from({ length: step % 4 }, (_, n) => ({
          ...dated(
            `${p}:${n}`,
            n % 2 === 0
              ? { due: octoberDay(step * 7 + n) }
              : { scheduled: octoberDay(step * 3 + n), due: octoberDay(step + n) },
          ),
          path: p,
        }));
        target.publish("note-property", { path: p }, items);
      };
      const last = new Map<VaultPath, number>();
      for (let step = 0; step < 60; step++) {
        const p = paths[step % paths.length] ?? path;
        publishFor(index, p, step);
        last.set(p, step);
        index.datedIn(roles, day(octoberDay(step)), day(octoberDay(step + 5)));
        index.datedIn(["done", "due"], day("2026-10-01"), day("2026-10-31"));
      }
      const { index: fresh } = await build();
      for (const [p, step] of last) publishFor(fresh, p, step);
      for (const range of [
        ["2026-10-01", "2026-10-31"],
        ["2026-10-12", "2026-10-18"],
        ["2026-10-20", "2026-10-20"],
      ] as const) {
        for (const asked of [roles, ["due"], ["scheduled"]] as const) {
          expect(index.datedIn(asked, day(range[0]), day(range[1]))).toEqual(
            fresh.datedIn(asked, day(range[0]), day(range[1])),
          );
        }
      }
    });
  });
});
