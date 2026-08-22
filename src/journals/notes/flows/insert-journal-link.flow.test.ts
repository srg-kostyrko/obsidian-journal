import { beforeEach, describe, expect, it, vi } from "vitest";

import { DayPeriod, type OpenInterval, type AnchorString } from "@/calendar";
import { date } from "@/calendar/testing";
import { Flows } from "@/infrastructure/flows";
import { WorkspaceService } from "@/infrastructure/host";
import { testContainer, type TestHarness } from "@/testing";

import { journalsCoreModule } from "../../module";
import { fixedJournal } from "../../testing";

import { InsertJournalLinkFlow } from "./insert-journal-link.flow";

const tick = (): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, 0));

// The fake vault models no `workspace.activeEditor`, so the real insertNoteLinkAtCursor has no
// editor to write into and nothing lands anywhere observable. The path it is handed is the
// contract, and this is the only seam that carries it.
function captureInsertions(harness: TestHarness) {
  return vi.spyOn(harness.resolve(WorkspaceService), "insertNoteLinkAtCursor").mockReturnValue(true);
}

describe("InsertJournalLinkFlow", () => {
  describe("exactly one journal", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
    });

    it("inserts a link to the picked date's note path when a single journal exists", async () => {
      const insert = captureInsertions(harness);
      const promise = harness.resolve(Flows).invoke(InsertJournalLinkFlow);
      await tick();

      harness.modals.lastOpen().submit(DayPeriod.containing(date("2026-01-01")));
      await promise;

      expect(insert).toHaveBeenCalledWith("2026-01-01.md");
    });

    it("does not insert when the date picker is cancelled", async () => {
      const insert = captureInsertions(harness);
      const promise = harness.resolve(Flows).invoke(InsertJournalLinkFlow);
      await tick();

      harness.modals.lastOpen().cancel();
      await promise;

      expect(insert).not.toHaveBeenCalled();
    });
  });

  describe("more than one journal", () => {
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

    it("prompts for a journal before the date when more than one exists", async () => {
      const insert = captureInsertions(harness);
      const promise = harness.resolve(Flows).invoke(InsertJournalLinkFlow);
      await tick();

      harness.suggests.lastOpen().choose("weekly");
      await tick();
      harness.modals.lastOpen().submit(DayPeriod.containing(date("2026-01-01")));
      await promise;

      // The weekly journal names the week 2026-01-01 falls in, which the daily journal never would.
      expect(insert).toHaveBeenCalledWith("2026-W1.md");
    });

    it("does not insert when the journal picker is cancelled", async () => {
      const insert = captureInsertions(harness);
      const promise = harness.resolve(Flows).invoke(InsertJournalLinkFlow);
      await tick();

      harness.suggests.lastOpen().cancel();
      await promise;

      expect(insert).not.toHaveBeenCalled();
    });
  });

  it("bounds the date picker to the journal timeline", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            { timeline: { start: "2026-06-01" as AnchorString, end: { kind: "never" } } },
          ),
        },
      },
    });
    captureInsertions(harness);
    const promise = harness.resolve(Flows).invoke(InsertJournalLinkFlow);
    await tick();

    const handle = harness.modals.lastOpen<{ bounds?: OpenInterval }, DayPeriod>();
    handle.submit(DayPeriod.containing(date("2026-06-15")));
    await promise;

    expect(handle.props.bounds?.start.match({ some: (d) => d.toAnchor(), none: () => null })).toBe("2026-06-01");
  });
});
