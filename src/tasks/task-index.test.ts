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
});
