import { describe, expect, it } from "vitest";
import { defineComponent, ref, type ComputedRef } from "vue";

import type { AnchorString } from "@/calendar";
import { JournalsRepository } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { useCollisionCheck } from "./use-collision-check";

import type { PathCollision } from "./name-template-collision";
import type { JournalConfig } from "../../config";

function probe(harness: TestHarness, journalName: string): ComputedRef<PathCollision | null> {
  const config = ref(harness.resolve(JournalsRepository).get(journalName).getOrUndefined());
  let captured: ComputedRef<PathCollision | null> | undefined;
  const Probe = defineComponent({
    setup() {
      captured = useCollisionCheck(config);
      return undefined;
    },
    template: "<div />",
  });
  harness.render(Probe);
  if (!captured) throw new Error("probe did not capture the collision ref");
  return captured;
}

function dayJournal(overrides: Partial<JournalConfig> = {}): JournalConfig {
  return fixedJournal(
    "daily",
    { type: "day" },
    { timeline: { start: "2026-01-01" as AnchorString, end: { kind: "never" } }, ...overrides },
  );
}

describe("useCollisionCheck", () => {
  it("stays silent for a template whose date varies per period", async () => {
    const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: { daily: dayJournal() } } });

    expect(probe(harness, "daily").value).toBeNull();
  });

  it("flags a template whose boundary modifier collapses the date", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: dayJournal({ nameTemplate: "{{date<endOf=month>}}" }) } },
    });

    expect(probe(harness, "daily").value).toMatchObject({ first: "2026-01-01", second: "2026-01-02" });
  });

  it("flags a template whose shift and boundary collapse the date", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: dayJournal({ nameTemplate: "{{date+1w<endOf=month>:YYYY-MM-DD}}" }) } },
    });

    expect(probe(harness, "daily").value).not.toBeNull();
  });

  it("flags a template whose inline format is coarser than the period", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: dayJournal({ nameTemplate: "{{date:YYYY-MM}}" }) } },
    });

    expect(probe(harness, "daily").value).toMatchObject({ path: "2026-01.md" });
  });

  it("flags a plain date variable when the journal's own date format is coarser than the period", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: dayJournal({ nameTemplate: "{{date}}", dateFormat: "YYYY-MM" }) } },
    });

    expect(probe(harness, "daily").value).toMatchObject({ path: "2026-01.md" });
  });

  it("flags a template with no date variable at all", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: dayJournal({ nameTemplate: "MyNote" }) } },
    });

    expect(probe(harness, "daily").value).toMatchObject({ path: "MyNote.md" });
  });

  it("stays silent when the folder disambiguates a coarse name", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: { daily: dayJournal({ nameTemplate: "{{date:YYYY-MM}}", folder: "Journal/{{date:DD}}" }) },
      },
    });

    expect(probe(harness, "daily").value).toBeNull();
  });

  it("stays silent for an empty name template", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: dayJournal({ nameTemplate: "" }) } },
    });

    expect(probe(harness, "daily").value).toBeNull();
  });

  it("stays silent when the timeline ends before the colliding period", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: dayJournal({
            nameTemplate: "{{date<endOf=month>}}",
            timeline: { start: "2026-01-01" as AnchorString, end: { kind: "repeats", count: 1 } },
          }),
        },
      },
    });

    expect(probe(harness, "daily").value).toBeNull();
  });

  it("flags a day-of-month format colliding across a later sample in the walk", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: dayJournal({ nameTemplate: "{{date:DD}}" }) } },
    });

    expect(probe(harness, "daily").value).toMatchObject({ first: "2026-01-01", second: "2026-02-01", path: "01.md" });
  });
});
