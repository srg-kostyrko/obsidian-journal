import { describe, expect, it } from "vitest";
import { defineComponent, nextTick } from "vue";

import { JournalsRepository } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { customJournal, fixedJournal } from "@/journals/testing";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { testContainer, type TestHarness } from "@/testing";

import { useShelfScope, type ShelfScope } from "./use-shelf-scope";

const MODULES = [journalsCoreModule, shelvesCoreModule];

function resolveScope(harness: TestHarness, shelfName: () => string | null): ShelfScope {
  let captured: ShelfScope | undefined;
  const Probe = defineComponent({
    setup() {
      captured = useShelfScope(shelfName);
      return undefined;
    },
    template: "<div />",
  });
  harness.render(Probe);
  if (!captured) throw new Error("probe did not capture the shelf scope");
  return captured;
}

describe("useShelfScope", () => {
  it("returns every journal partitioned by write type when shelf is null", async () => {
    const harness = await testContainer({
      modules: MODULES,
      data: {
        journals: {
          daily: fixedJournal("daily", { type: "day" }),
          weekly: fixedJournal("weekly", { type: "week" }),
          custom1: customJournal("custom1", "day", 3, "2026-01-01"),
        },
      },
    });

    const scope = resolveScope(harness, () => null);

    expect([...scope.all.value]).toEqual(["daily", "weekly", "custom1"]);
    expect([...scope.day.value]).toEqual(["daily"]);
    expect([...scope.week.value]).toEqual(["weekly"]);
    expect([...scope.custom.value]).toEqual(["custom1"]);
    expect([...scope.month.value]).toEqual([]);
  });

  it("excludes custom-interval journals from the fixed bucket", async () => {
    const harness = await testContainer({
      modules: MODULES,
      data: {
        journals: {
          daily: fixedJournal("daily", { type: "day" }),
          weekly: fixedJournal("weekly", { type: "week" }),
          custom1: customJournal("custom1", "day", 3, "2026-01-01"),
        },
      },
    });

    const scope = resolveScope(harness, () => null);

    expect([...scope.fixed.value]).toEqual(["daily", "weekly"]);
  });

  it("filters journals to those listed by the named shelf", async () => {
    const harness = await testContainer({
      modules: MODULES,
      data: {
        journals: {
          daily: fixedJournal("daily", { type: "day" }),
          weekly: fixedJournal("weekly", { type: "week" }),
          monthly: fixedJournal("monthly", { type: "month" }),
        },
        shelves: { work: buildShelf("work", { journals: ["daily", "weekly"] }) },
      },
    });

    const scope = resolveScope(harness, () => "work");

    expect([...scope.all.value]).toEqual(["daily", "weekly"]);
    expect([...scope.month.value]).toEqual([]);
  });

  it("returns empty buckets when the shelf name is unknown", async () => {
    const harness = await testContainer({
      modules: MODULES,
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });

    const scope = resolveScope(harness, () => "missing");

    expect([...scope.all.value]).toEqual([]);
    expect([...scope.day.value]).toEqual([]);
  });

  it("re-computes when a journal is added to the underlying repository", async () => {
    const harness = await testContainer({
      modules: MODULES,
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
    const scope = resolveScope(harness, () => null);
    expect([...scope.day.value]).toEqual(["daily"]);

    // testContainer hands out no mutable proxy to seed against directly, so the addition goes
    // through the real repository's own write API rather than a hand-made reactive() wrapper —
    // this now proves the settings store's own reactivity, not a fixture's.
    harness.resolve(JournalsRepository).create("morning", { type: "day" });
    await nextTick();

    expect([...scope.day.value]).toEqual(["daily", "morning"]);
  });
});
