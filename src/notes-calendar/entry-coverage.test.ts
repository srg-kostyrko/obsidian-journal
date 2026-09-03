import { describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { CycleService } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { customJournal, fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import { entryCoversDate } from "./entry-coverage";

const MODULES = [journalsCoreModule];

describe("entryCoversDate", () => {
  it("holds when the date sits inside the entry's period", async () => {
    const harness = await testContainer({
      modules: MODULES,
      data: { journals: { quarterly: fixedJournal("quarterly", { type: "quarter" }) } },
    });
    const cycle = harness.resolve(CycleService);

    const result = entryCoversDate(
      cycle,
      { journalName: "quarterly", anchor: "2026-07-01" as AnchorString },
      "2026-08-15" as AnchorString,
    );

    expect(result).toBe(true);
  });

  it("fails when the date sits outside the entry's period", async () => {
    const harness = await testContainer({
      modules: MODULES,
      data: { journals: { quarterly: fixedJournal("quarterly", { type: "quarter" }) } },
    });
    const cycle = harness.resolve(CycleService);

    const result = entryCoversDate(
      cycle,
      { journalName: "quarterly", anchor: "2026-07-01" as AnchorString },
      "2026-06-15" as AnchorString,
    );

    expect(result).toBe(false);
  });

  it("holds for a custom interval whose period contains the date", async () => {
    const harness = await testContainer({
      modules: MODULES,
      data: { journals: { sprint: customJournal("sprint", "week", 2, "2026-01-05") } },
    });
    const cycle = harness.resolve(CycleService);

    // The sprint anchored 2026-01-05 repeats every two weeks, so 2026-07-06 starts one that
    // runs through 2026-07-19.
    const result = entryCoversDate(
      cycle,
      { journalName: "sprint", anchor: "2026-07-06" as AnchorString },
      "2026-07-10" as AnchorString,
    );

    expect(result).toBe(true);
  });

  it("fails closed for a journal the repository does not know", async () => {
    const harness = await testContainer({
      modules: MODULES,
      data: { journals: { quarterly: fixedJournal("quarterly", { type: "quarter" }) } },
    });
    const cycle = harness.resolve(CycleService);

    const result = entryCoversDate(
      cycle,
      { journalName: "does-not-exist", anchor: "2026-07-01" as AnchorString },
      "2026-07-01" as AnchorString,
    );

    expect(result).toBe(false);
  });
});
