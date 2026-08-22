import { beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarDate } from "@/calendar";
import { anchor } from "@/calendar/testing";
import { Flows } from "@/infrastructure/flows";
import { testContainer, type TestHarness } from "@/testing";

import { journalsCoreModule } from "../module";
import { fixedJournal } from "../testing";

import { JournalUriHandler } from "./journal-uri-handler";

const DAILY = fixedJournal("daily", { type: "day" });
const WORK = fixedJournal("work", { type: "day" });
const FUTURE_DAILY = fixedJournal(
  "daily",
  { type: "day" },
  { timeline: { start: anchor("2027-01-01"), end: { kind: "never" } } },
);

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function trigger(harness: TestHarness, parameters: Record<string, string>): void {
  harness.host.emitProtocol("journals", { action: "journals", ...parameters });
}

describe("JournalUriHandler dispatch", () => {
  describe("one daily journal", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: DAILY } },
        initialize: [JournalUriHandler],
      });
    });

    it("invokes OpenDateFlow for a named journal and ISO date", async () => {
      trigger(harness, { journal: "daily", date: "2026-06-04", mode: "tab" });
      await flush();

      expect(harness.host.workspace.openCalls).toEqual([{ path: "2026-06-04.md", mode: "tab" }]);
    });

    it("defaults to today when no date is given", async () => {
      trigger(harness, { journal: "daily" });
      await flush();

      expect(harness.host.workspace.openCalls).toEqual([
        { path: `${CalendarDate.today().toAnchor()}.md`, mode: false },
      ]);
    });
  });

  it("passes every journal of a write type as candidates", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: DAILY, work: WORK } },
      initialize: [JournalUriHandler],
    });

    trigger(harness, { type: "day", date: "2026-06-04" });
    await flush();

    expect(harness.suggests.lastOpen<readonly string[], string>().input).toEqual(["daily", "work"]);
  });
});

describe("JournalUriHandler errors", () => {
  // Both tests below keep the dispatch spy: their refusals happen before any note is touched, so
  // the vault cannot tell a flow that was not dispatched at all from one dispatched and refused.
  describe("no journals configured", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: {} },
        initialize: [JournalUriHandler],
      });
    });

    it("notifies and opens nothing for an unknown journal name", async () => {
      const invokeSpy = vi.spyOn(harness.resolve(Flows), "invoke");

      trigger(harness, { journal: "missing" });
      await flush();

      expect(invokeSpy).not.toHaveBeenCalled();
      expect(harness.notices.messages).toHaveLength(1);
    });

    it("notifies when no journal of the requested type exists", async () => {
      const invokeSpy = vi.spyOn(harness.resolve(Flows), "invoke");

      trigger(harness, { type: "week" });
      await flush();

      expect(invokeSpy).not.toHaveBeenCalled();
      expect(harness.notices.messages).toHaveLength(1);
      expect(harness.notices.messages[0]).toContain("week");
    });
  });

  it("notifies and opens nothing for a date that cannot be parsed", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: DAILY } },
      initialize: [JournalUriHandler],
    });

    trigger(harness, { journal: "daily", date: "not-a-date" });
    await flush();

    expect(harness.host.workspace.openCalls).toEqual([]);
    expect(harness.notices.messages).toHaveLength(1);
  });

  it("notifies when the flow reports no applicable journals", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: FUTURE_DAILY } },
      initialize: [JournalUriHandler],
    });

    // anchorOf answers for a journal outside its own timeline, so the handler dispatches and the
    // flow is the one that finds nothing applicable — the seam this test is about.
    trigger(harness, { journal: "daily", date: "2026-06-04" });
    await flush();

    expect(harness.notices.messages).toHaveLength(1);
  });

  it("stays silent when the journal picker is dismissed", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: DAILY, work: WORK } },
      initialize: [JournalUriHandler],
    });

    trigger(harness, { type: "day", date: "2026-06-04" });
    await flush();
    harness.suggests.lastOpen().cancel();
    await flush();

    expect(harness.notices.messages).toHaveLength(0);
  });
});
