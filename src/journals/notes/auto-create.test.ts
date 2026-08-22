import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import type { VaultPath } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { testContainer, type TestHarness } from "@/testing";

import { JournalsIndex } from "../journals-index";
import { journalsCoreModule } from "../module";
import { fixedJournal } from "../testing";

import { AutoCreateService } from "./auto-create";
import { NoteCreationService } from "./note-creation";

describe("AutoCreateService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 19, 9, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("a daily journal that auto-creates", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { autoCreate: true }) } },
      });
    });

    it("waits for the index before creating, so a note living off its derived path is reused", async () => {
      // The index lookup in ensureNote is the only thing that stops a connected note living away
      // from its derived path (bulk-added with "keep name", renamed, moved) from being duplicated.
      // At boot the index is built behind layout-ready and all-notes-resolved, so ticking before
      // it is populated creates a second note for the same anchor.
      const index = harness.resolve(JournalsIndex);
      harness.host.putFile("Daily/Monday standup.md", "");

      await harness.resolve(AutoCreateService).initialize();
      await vi.advanceTimersByTimeAsync(0);
      expect(harness.host.files.has("2026-05-19.md")).toBe(false);

      index.register({
        journalName: "daily",
        anchor: anchor("2026-05-19"),
        path: "Daily/Monday standup.md" as VaultPath,
      });
      index.markReady();
      await vi.advanceTimersByTimeAsync(0);

      expect(harness.host.files.has("2026-05-19.md")).toBe(false);
    });

    it("re-ticks at the next local midnight", async () => {
      harness.resolve(JournalsIndex).markReady();
      await harness.resolve(AutoCreateService).initialize();
      await vi.advanceTimersByTimeAsync(0);
      expect(harness.host.files.has("2026-05-19.md")).toBe(true);

      await vi.advanceTimersByTimeAsync(15 * 60 * 60 * 1000);

      expect(harness.host.files.has("2026-05-20.md")).toBe(true);
    });

    it("stops ticking after dispose", async () => {
      const service = harness.resolve(AutoCreateService);
      harness.resolve(JournalsIndex).markReady();
      await service.initialize();

      await service[Symbol.asyncDispose]();
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

      expect(harness.host.files.has("2026-05-19.md")).toBe(true);
      expect(harness.host.files.has("2026-05-20.md")).toBe(false);
    });
  });

  it("creates today's note for journals with autoCreate=true", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal("daily", { type: "day" }, { autoCreate: true }),
          monthly: fixedJournal("monthly", { type: "month" }, { autoCreate: false }),
        },
      },
    });
    harness.resolve(JournalsIndex).markReady();

    await harness.resolve(AutoCreateService).initialize();
    await vi.advanceTimersByTimeAsync(0);

    expect(harness.host.files.has("2026-05-19.md")).toBe(true);
    expect(harness.host.files.has("2026-05.md")).toBe(false);
  });

  it("writes the canonical period anchor as journal-date for non-daily journals", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { monthly: fixedJournal("monthly", { type: "month" }, { autoCreate: true }) } },
    });
    harness.resolve(JournalsIndex).markReady();

    await harness.resolve(AutoCreateService).initialize();
    await vi.advanceTimersByTimeAsync(0);

    expect(harness.host.files.get("2026-05.md")?.frontmatter["journal-date"]).toBe("2026-05-01");
  });

  it("skips creation when today is past the journal's end date", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          ended: fixedJournal(
            "ended",
            { type: "day" },
            { autoCreate: true, timeline: { start: "2026-01-01", end: { kind: "date", date: "2026-01-31" } } as never },
          ),
        },
      },
    });
    harness.resolve(JournalsIndex).markReady();

    await harness.resolve(AutoCreateService).initialize();
    await vi.advanceTimersByTimeAsync(0);

    expect(harness.host.files.has("2026-05-19.md")).toBe(false);
  });

  it("skips creation when today precedes the journal's start date", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          upcoming: fixedJournal(
            "upcoming",
            { type: "day" },
            { autoCreate: true, timeline: { start: "2026-06-01", end: { kind: "never" } } as never },
          ),
        },
      },
    });
    harness.resolve(JournalsIndex).markReady();

    await harness.resolve(AutoCreateService).initialize();
    await vi.advanceTimersByTimeAsync(0);

    expect(harness.host.files.has("2026-05-19.md")).toBe(false);
  });

  it("isolates errors per-journal — one failing journal does not stop others", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          a: fixedJournal("a", { type: "day" }, { autoCreate: true, folder: "A" }),
          b: fixedJournal("b", { type: "day" }, { autoCreate: true, folder: "B" }),
        },
      },
    });
    vi.spyOn(harness.resolve(NoteCreationService), "ensureNote").mockImplementationOnce(() =>
      AsyncResult.err(new Error("forced failure") as never),
    );
    harness.resolve(JournalsIndex).markReady();

    await harness.resolve(AutoCreateService).initialize();
    await vi.advanceTimersByTimeAsync(0);

    const aExists = harness.host.files.has("A/2026-05-19.md");
    const bExists = harness.host.files.has("B/2026-05-19.md");
    expect(aExists || bExists).toBe(true);
    expect(aExists && bExists).toBe(false);
  });

  it("creates the note without opening the confirm modal even when confirmCreation is true", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: { daily: fixedJournal("daily", { type: "day" }, { autoCreate: true, confirmCreation: true }) },
      },
    });
    harness.resolve(JournalsIndex).markReady();

    await harness.resolve(AutoCreateService).initialize();
    await vi.advanceTimersByTimeAsync(0);

    expect(harness.host.files.has("2026-05-19.md")).toBe(true);
    expect(harness.modals.opens).toHaveLength(0);
  });
});
