import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarDate } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import type { Container } from "@/infrastructure/di";
import { NoteMetadataService, type VaultPath } from "@/infrastructure/host";
import { FakeNoteMetadataService } from "@/infrastructure/host/testing";
import { CycleService, JournalsIndex, JournalsRepository, TimelineService } from "@/journals";
import type { JournalConfig } from "@/journals/config";
import { customJournal, fakeRepo, fixedJournal } from "@/journals/testing";
import { createSettingsService } from "@/settings/testing";
import { ShelvesRepository, type ShelfConfig, type ShelvesEvents } from "@/shelves";

import { DecorationsStore } from "./decorations-store";
import { DecorationEngine } from "./engine";
import { DecorationMatchService } from "./match-service";
import { CUSTOM_MATCH_HORIZON } from "./match-window";
import { decorationsSlice } from "./settings/slice";
import { buildCalendarDecoration, buildCondition, buildDecoration, buildStyle } from "./testing";

import type { JournalDecoration } from "./config";
import type { MatchBadge } from "./match-service";

interface Harness {
  c: Container;
  store: DecorationsStore;
  index: JournalsIndex;
  fakeMetadata: FakeNoteMetadataService;
  service: DecorationMatchService;
}

// Mirrors use-cell-decorations.test.ts's harness: same registrations, minus the Vue-only pieces
// this service never touches (no NotesService emitter, no cell-map rendering).
function buildHarness(journals: Record<string, JournalConfig> = {}): Harness {
  const { container: c, service: settings } = createSettingsService({ slices: [decorationsSlice] });
  settings.getSlice(decorationsSlice).state = { decorations: [] };
  c.register(JournalsRepository).useValue(fakeRepo(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(TimelineService).useClass(TimelineService);
  const fakeMetadata = new FakeNoteMetadataService();
  c.register(NoteMetadataService).useValue(fakeMetadata as unknown as NoteMetadataService);
  c.register(DecorationEngine).useClass(DecorationEngine);
  const shelfStorage: Record<string, ShelfConfig> = {};
  c.register(ShelvesRepository).useValue(ShelvesRepository.fromParts(shelfStorage, createNanoEvents<ShelvesEvents>()));
  c.register(DecorationsStore).useClass(DecorationsStore);
  c.register(DecorationMatchService).useClass(DecorationMatchService);
  return {
    c,
    store: c.resolve(DecorationsStore),
    index: c.resolve(JournalsIndex),
    fakeMetadata,
    service: c.resolve(DecorationMatchService),
  };
}

function date(s: string): CalendarDate {
  const r = CalendarDate.parse(s);
  if (r.kind === "err") throw new Error(`bad date: ${s}`);
  return r.value;
}

function expectMatched(badge: MatchBadge): Extract<MatchBadge, { kind: "matched" }> {
  if (badge.kind !== "matched") throw new Error(`expected matched, got ${badge.kind}`);
  return badge;
}

function expectSilent(badge: MatchBadge): Extract<MatchBadge, { kind: "silent" }> {
  if (badge.kind !== "silent") throw new Error(`expected silent, got ${badge.kind}`);
  return badge;
}

// A wildcard date condition matches every period, so a run's matched count equals its total —
// useful for isolating the unit/direction/total machinery from the matching logic itself.
const wildcard = buildCondition("date", { day: -1, month: -1, year: null });

function neverMatches(): JournalDecoration {
  return buildDecoration({
    mode: "or",
    conditions: [buildCondition("weekday", { weekdays: [] })],
    styles: [buildStyle("background")],
  });
}

let teardown: () => void;
beforeEach(() => {
  ({ teardown } = installTestCalendar());
  vi.useFakeTimers();
  // 2026-05-25 is a Monday.
  vi.setSystemTime(new Date(2026, 4, 25, 9, 0, 0));
});
afterEach(() => {
  vi.useRealTimers();
  teardown();
});

describe("DecorationMatchService", () => {
  describe("counting", () => {
    it("counts the periods a decoration matched", () => {
      // A weekday-only decoration matches on schedule rather than every period, so a broken
      // implementation that reports total instead of the real match count (or matches every
      // period regardless of condition) fails this: 13 Mondays fall in the last 90 days ending
      // on a Monday, not 90.
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("background")],
      });
      const h = buildHarness({ daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }) });

      const badge = expectMatched(h.service.describe({ kind: "journal", journalName: "daily" }, 0));
      expect(badge.matched).toBe(13);
      expect(badge.total).toBe(90);
    });

    it("reports the clipped total for a journal younger than its horizon", () => {
      // Without clipping the denominator to the timeline, a 12-week-old journal would report
      // against the full 26-week horizon instead of the 12 weeks it has actually existed.
      const decoration = neverMatches();
      const h = buildHarness({
        weekly: fixedJournal(
          "weekly",
          { type: "week" },
          {
            decorations: [decoration],
            timeline: { start: date("2026-03-09").toAnchor(), end: { kind: "never" } },
          },
        ),
      });

      const badge = expectSilent(h.service.describe({ kind: "journal", journalName: "weekly" }, 0));
      expect(badge.total).toBe(12);
    });

    it("reports silent for a decoration that matched nothing", () => {
      // Flips the > 0 branch: a decoration with zero matches must not read as "matched".
      const decoration = neverMatches();
      const h = buildHarness({ daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }) });

      const badge = h.service.describe({ kind: "journal", journalName: "daily" }, 0);
      expect(badge.kind).toBe("silent");
    });
  });

  describe("finished journals", () => {
    it("reports a real match count for a journal whose timeline has already ended", () => {
      // Anchoring at today instead of the timeline's own end would clip this journal's
      // entire 2020-2021 history away and misreport it as having none: today's window
      // (roughly 2026-02-25 through 2026-05-25) shares no periods with a timeline that ended
      // in mid-2021, so every one of those periods would fail the end-bound check.
      const decoration = buildDecoration({ mode: "or", conditions: [wildcard], styles: [buildStyle("background")] });
      const h = buildHarness({
        daily: fixedJournal(
          "daily",
          { type: "day" },
          {
            decorations: [decoration],
            timeline: {
              start: date("2020-01-01").toAnchor(),
              end: { kind: "date", date: date("2021-06-30").toAnchor() },
            },
          },
        ),
      });

      const badge = expectMatched(h.service.describe({ kind: "journal", journalName: "daily" }, 0));
      expect(badge.matched).toBe(90);
      expect(badge.total).toBe(90);
      expect(badge.direction).toBe("past");
    });
  });

  describe("evidence", () => {
    it("reports a single-period total for a journal whose timeline starts today", () => {
      // The design was corrected to say a journal starting today still has today's own period —
      // it reports against a denominator of one rather than emptying into "no history yet". A
      // one-character regression in TimelineService.contains that starts excluding a journal's
      // own start date (e.g. flipping >= to >) would silently turn every fresh journal's badge
      // into "no history yet", the exact state the design says must not be the fresh-journal case.
      const decoration = neverMatches();
      const h = buildHarness({
        daily: fixedJournal(
          "daily",
          { type: "day" },
          { decorations: [decoration], timeline: { start: date("2026-05-25").toAnchor(), end: { kind: "never" } } },
        ),
      });

      const badge = expectSilent(h.service.describe({ kind: "journal", journalName: "daily" }, 0));
      expect(badge.total).toBe(1);
    });

    it("reports no notes for a note-needing decoration over a note-free window", () => {
      // Without the notes gate, an empty index would silently read as "silent" (0 matched)
      // rather than the "we cannot tell yet" state the note-based condition demands.
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("has-note")],
        styles: [buildStyle("background")],
      });
      const h = buildHarness({ daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }) });

      const badge = h.service.describe({ kind: "journal", journalName: "daily" }, 0);
      expect(badge.kind).toBe("no-notes");
    });

    it("counts normally for a note-needing decoration once one note exists", () => {
      // Seeding a single entry must flip the state machine out of "no-notes" and back into
      // ordinary counting — this catches an implementation that ignores the index entirely.
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("has-note")],
        styles: [buildStyle("background")],
      });
      const h = buildHarness({ daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }) });
      const path = "Daily/2026-05-25.md" as VaultPath;
      h.index.register({ journalName: "daily", anchor: date("2026-05-25").toAnchor(), path });
      h.fakeMetadata.setMetadata(path, { title: "2026-05-25", tags: [], properties: {}, tasks: [] });

      const badge = expectMatched(h.service.describe({ kind: "journal", journalName: "daily" }, 0));
      expect(badge.matched).toBe(1);
    });

    it("reports silent rather than no notes for a date-only decoration over a note-free window", () => {
      // The one test that pins needsNotes into the service: a decoration that never needs a
      // note must report "silent" over a note-free window, not "no-notes". An implementation
      // that reports "no-notes" for any note-free window regardless of the decoration would
      // pass every other evidence test but fail this one.
      const decoration = neverMatches();
      const h = buildHarness({ daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }) });

      const badge = h.service.describe({ kind: "journal", journalName: "daily" }, 0);
      expect(badge.kind).toBe("silent");
    });
  });

  describe("direction", () => {
    it("looks forward for a journal whose timeline starts in the future", () => {
      // Swapping the isAfter comparison (or dropping the future branch entirely) leaves this
      // reporting "past", so the window would look backward from today into a history that
      // does not exist yet.
      const decoration = buildDecoration({ mode: "or", conditions: [wildcard], styles: [buildStyle("background")] });
      const h = buildHarness({
        daily: fixedJournal(
          "daily",
          { type: "day" },
          {
            decorations: [decoration],
            timeline: { start: date("2026-05-26").toAnchor(), end: { kind: "never" } },
          },
        ),
      });

      const badge = expectMatched(h.service.describe({ kind: "journal", journalName: "daily" }, 0));
      expect(badge.direction).toBe("future");
    });

    it("looks backward for a journal with history", () => {
      const decoration = buildDecoration({ mode: "or", conditions: [wildcard], styles: [buildStyle("background")] });
      const h = buildHarness({ daily: fixedJournal("daily", { type: "day" }, { decorations: [decoration] }) });

      const badge = expectMatched(h.service.describe({ kind: "journal", journalName: "daily" }, 0));
      expect(badge.direction).toBe("past");
    });
  });

  describe("custom-interval clipping", () => {
    it("clips a day-granular window by the interval owning each day, not the day itself", () => {
      // The timeline start (2026-03-15) falls inside the interval anchored 2026-03-09, which
      // straddles it and so stays entirely in-timeline — including its six pre-start days. The
      // interval anchored 2026-02-23 ends (2026-03-08) before the start and is dropped whole.
      // Correct total: 90 window days minus the 12 that belong to the dropped interval = 78,
      // with 6 offset-1 matches (one per surviving interval's first day). An implementation that
      // clips each day against the timeline directly, instead of resolving it to its owning
      // interval first, wrongly excludes the straddling interval's six pre-start days and
      // reports 72 instead of 78.
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("offset", { offset: 1 })],
        styles: [buildStyle("background")],
      });
      const h = buildHarness({
        sprint: customJournal("sprint", "week", 2, "2020-01-06", {
          decorations: [decoration],
          timeline: { start: date("2026-03-15").toAnchor(), end: { kind: "never" } },
        }),
      });

      const badge = expectMatched(h.service.describe({ kind: "journal", journalName: "sprint" }, 0));
      expect(badge.total).toBe(78);
      expect(badge.matched).toBe(6);
    });
  });

  describe("units", () => {
    it("reports weeks for a weekly journal", () => {
      const decoration = buildDecoration({ mode: "or", conditions: [wildcard], styles: [buildStyle("background")] });
      const h = buildHarness({ weekly: fixedJournal("weekly", { type: "week" }, { decorations: [decoration] }) });

      const badge = expectMatched(h.service.describe({ kind: "journal", journalName: "weekly" }, 0));
      expect(badge.unit).toBe("week");
    });

    it("reports intervals for a custom journal", () => {
      // periodKindForWrite("custom") is "day"; a service that reports that raw value instead
      // of overriding to "interval" fails the unit assertion. And a service that substitutes
      // a day-granular window of the right length (right total, wrong spacing) fails the
      // matched count: interval anchors 14 days apart all land on the same weekday
      // (2020-01-06 is a Monday), but 20 consecutive days would not.
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("weekday", { weekdays: [1] })],
        styles: [buildStyle("background")],
      });
      const h = buildHarness({
        sprint: customJournal("sprint", "week", 2, "2020-01-06", { decorations: [decoration] }),
      });

      const badge = expectMatched(h.service.describe({ kind: "journal", journalName: "sprint" }, 0));
      expect(badge.total).toBe(CUSTOM_MATCH_HORIZON);
      expect(badge.matched).toBe(CUSTOM_MATCH_HORIZON);
      expect(badge.unit).toBe("interval");
    });

    it("reports days for an offset decoration on a custom journal", () => {
      // periodForJournal maps every interval to its own first day, so an interval-anchored
      // window can only ever satisfy offset 1 — reusing it for an offset-3 decoration would
      // report "silent" forever. A day-granular window is the only way this can fire, and
      // its unit must read "day" rather than "interval" to match what was actually walked.
      const decoration = buildDecoration({
        mode: "or",
        conditions: [buildCondition("offset", { offset: 3 })],
        styles: [buildStyle("background")],
      });
      const h = buildHarness({
        sprint: customJournal("sprint", "week", 2, "2020-01-06", { decorations: [decoration] }),
      });

      const badge = expectMatched(h.service.describe({ kind: "journal", journalName: "sprint" }, 0));
      expect(badge.matched).toBe(7);
      expect(badge.unit).toBe("day");
    });

    it("reports days for a vault-wide decoration", () => {
      const decoration = buildCalendarDecoration({
        mode: "or",
        conditions: [wildcard],
        styles: [buildStyle("background")],
      });
      const h = buildHarness();
      h.store.save({ kind: "global" }, [decoration]);

      const badge = expectMatched(h.service.describe({ kind: "global" }, 0));
      expect(badge.unit).toBe("day");
    });
  });
});
