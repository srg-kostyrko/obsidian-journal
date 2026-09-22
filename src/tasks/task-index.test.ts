import { describe, expect, it, vi } from "vitest";

import type { VaultPath } from "@/infrastructure/host";
import { testContainer, type TestHarness } from "@/testing";

import { tasksCoreModule } from "./module";
import { TaskIndex } from "./task-index";

import type { TaskItem } from "./types";

// TaskIndex is resolved from a container rather than constructed directly: a later task gives it
// an injected dependency, and a test written against a bare constructor would have to be rewritten
// at that point.
async function build(): Promise<{ harness: TestHarness; index: TaskIndex }> {
  const harness = await testContainer({ modules: [tasksCoreModule] });
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
