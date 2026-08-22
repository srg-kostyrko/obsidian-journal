import { __testing } from "obsidian";
import { assert, beforeEach, describe, it, expect, vi } from "vitest";

import { anchor, installTestCalendar } from "@/calendar/testing";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { testContainer, type TestHarness } from "@/testing";

import { JournalsIndex } from "../journals-index";
import { journalsCoreModule } from "../module";
import { NoApplicableJournals } from "../notes/errors";
import { fixedJournal } from "../testing";

import { OpenDateFlow } from "./open-date.flow";

const TIMELINE_OPEN = { start: anchor("2020-01-01"), end: { kind: "never" as const } };

describe("OpenDateFlow", () => {
  it("errors with NoApplicableJournals when no journal covers the anchor", async () => {
    installTestCalendar({ dow: 0, doy: 6 });
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            { timeline: { start: anchor("2030-01-01"), end: { kind: "never" } } },
          ),
        },
      },
    });

    const result = await harness.resolve(Flows).invoke(OpenDateFlow, { anchor: anchor("2026-05-19") });
    expect(result.isErr() && result.error instanceof NoApplicableJournals).toBe(true);
  });

  describe("exactly one applicable journal", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      installTestCalendar({ dow: 0, doy: 6 });
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { timeline: TIMELINE_OPEN }) } },
      });
    });

    it("dispatches OpenJournalEntryFlow directly when exactly one journal applies", async () => {
      const result = await harness.resolve(Flows).invoke(OpenDateFlow, { anchor: anchor("2026-05-19") });

      expect(result.isOk()).toBe(true);
      expect(harness.resolve(WorkspaceService).isOpen("2026-05-19.md" as VaultPath)).toBe(true);
      expect(harness.suggests.opens.length).toBe(0);
    });

    it("filters by existingOnly when requested", async () => {
      const result = await harness
        .resolve(Flows)
        .invoke(OpenDateFlow, { anchor: anchor("2026-05-19"), existingOnly: true });

      expect(result.isErr() && result.error instanceof NoApplicableJournals).toBe(true);
    });
  });

  describe("disambiguating between multiple applicable journals", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      installTestCalendar({ dow: 0, doy: 6 });
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            a: fixedJournal("a", { type: "day" }, { folder: "A", timeline: TIMELINE_OPEN }),
            b: fixedJournal("b", { type: "day" }, { folder: "B", timeline: TIMELINE_OPEN }),
          },
        },
      });
    });

    it("opens the suggest when multiple journals apply and dispatches the chosen one", async () => {
      const promise = harness.resolve(Flows).invoke(OpenDateFlow, { anchor: anchor("2026-05-19") });
      await Promise.resolve();
      await Promise.resolve();
      harness.suggests.lastOpen<string[], string>().choose("b");
      const result = await promise;

      expect(result.isOk()).toBe(true);
      expect(harness.resolve(WorkspaceService).isOpen("B/2026-05-19.md" as VaultPath)).toBe(true);
    });

    it("picks via a menu at the mouse event when pickAt is provided", async () => {
      // Mouse-driven clicks disambiguate with a native menu at the pointer; the
      // centered suggest stays for keyboard/command/URI entry points.
      __testing.reset();
      const event = new MouseEvent("click");
      const promise = harness.resolve(Flows).invoke(OpenDateFlow, { anchor: anchor("2026-05-19"), pickAt: event });
      await Promise.resolve();
      await Promise.resolve();
      const menu = __testing.lastOpenMenu();
      expect(menu.items.map((item) => item.title)).toEqual(["a", "b"]);
      expect(menu.showAtMouseEventCalls).toEqual([event]);
      (menu.items[1] as unknown as { click(): void } | undefined)?.click();
      const result = await promise;

      expect(result.isOk()).toBe(true);
      expect(harness.resolve(WorkspaceService).isOpen("B/2026-05-19.md" as VaultPath)).toBe(true);
      expect(harness.suggests.opens.length).toBe(0);
    });

    it("returns UserAborted when the pick menu is dismissed", async () => {
      __testing.reset();
      const promise = harness
        .resolve(Flows)
        .invoke(OpenDateFlow, { anchor: anchor("2026-05-19"), pickAt: new MouseEvent("click") });
      await Promise.resolve();
      await Promise.resolve();
      vi.useFakeTimers();
      try {
        __testing.lastOpenMenu().hide();
        await vi.runAllTimersAsync();
      } finally {
        vi.useRealTimers();
      }
      const result = await promise;

      expect(result.isErr() && result.error instanceof UserAborted).toBe(true);
    });

    it("returns UserAborted when the suggest is cancelled", async () => {
      const promise = harness.resolve(Flows).invoke(OpenDateFlow, { anchor: anchor("2026-05-19") });
      await Promise.resolve();
      await Promise.resolve();
      harness.suggests.lastOpen<string[], string>().cancel();
      const result = await promise;

      expect(result.isErr() && result.error instanceof UserAborted).toBe(true);
    });

    it("narrows by journalNames before timeline filtering", async () => {
      const result = await harness
        .resolve(Flows)
        .invoke(OpenDateFlow, { anchor: anchor("2026-05-19"), journalNames: ["a"] });

      expect(result.isOk()).toBe(true);
      expect(harness.resolve(WorkspaceService).isOpen("A/2026-05-19.md" as VaultPath)).toBe(true);
    });
  });

  describe("mid-period anchoring", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      installTestCalendar({ dow: 0, doy: 6 });
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: { weekly: fixedJournal("weekly", { type: "week" }, { folder: "W", timeline: TIMELINE_OPEN }) },
        },
      });
    });

    it("stores the period's canonical anchor when the date falls mid-period", async () => {
      const result = await harness
        .resolve(Flows)
        .invoke(OpenDateFlow, { anchor: anchor("2026-05-19"), journalNames: ["weekly"] });
      assert(result.isOk());

      expect(harness.host.files.get(result.value.path)?.frontmatter["journal-date"]).toBe("2026-05-17");
    });

    it("reaches an existing entry under existingOnly when the date falls mid-period", async () => {
      const existing = "W/2026-05-17.md" as VaultPath;
      harness.host.putFile(existing, "", { journal: "weekly", "journal-date": "2026-05-17" });
      harness.resolve(JournalsIndex).register({ journalName: "weekly", anchor: anchor("2026-05-17"), path: existing });

      const result = await harness
        .resolve(Flows)
        .invoke(OpenDateFlow, { anchor: anchor("2026-05-19"), journalNames: ["weekly"], existingOnly: true });

      expect(result.isOk()).toBe(true);
      expect(harness.resolve(WorkspaceService).isOpen(existing)).toBe(true);
    });

    it("re-anchors a note left at a mid-period date by an earlier open", async () => {
      const stale = "W/2026-W21.md" as VaultPath;
      harness.host.putFile(stale, "", { journal: "weekly", "journal-date": "2026-05-19" });

      const result = await harness
        .resolve(Flows)
        .invoke(OpenDateFlow, { anchor: anchor("2026-05-20"), journalNames: ["weekly"] });
      assert(result.isOk());
      // Asserted on the seeded path, not the returned one: a note created elsewhere would
      // carry the canonical date too, and prove nothing about repairing this one.
      expect(harness.host.files.get(stale)?.frontmatter["journal-date"]).toBe("2026-05-17");
    });
  });
});
