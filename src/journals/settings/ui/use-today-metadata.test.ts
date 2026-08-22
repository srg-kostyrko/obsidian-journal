import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, type ComputedRef } from "vue";

import type { JournalMetadata } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { useTodayMetadata } from "./use-today-metadata";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-05-19T12:00:00"));
});
afterEach(() => {
  vi.useRealTimers();
});

function probe(harness: TestHarness, journalName: string): ComputedRef<JournalMetadata | undefined> {
  let captured: ComputedRef<JournalMetadata | undefined> | undefined;
  const Probe = defineComponent({
    template: "<div />",
    setup() {
      captured = useTodayMetadata(journalName);
    },
  });
  harness.render(Probe);
  if (!captured) throw new Error("probe did not capture the metadata ref");
  return captured;
}

describe("useTodayMetadata", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal("daily", { type: "day" }),
          weekly: fixedJournal("weekly", { type: "week" }),
        },
      },
    });
  });

  it("returns today's metadata for an existing journal", () => {
    expect(probe(harness, "daily").value).toMatchObject({ journalName: "daily", anchor: "2026-05-19" });
  });

  it("returns undefined for a missing journal", () => {
    expect(probe(harness, "nope").value).toBeUndefined();
  });

  it("anchors the metadata at the start of today's period", () => {
    const metadata = probe(harness, "weekly");
    expect(metadata.value?.anchor).toBe("2026-05-18");
  });
});
