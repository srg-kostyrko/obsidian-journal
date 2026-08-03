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

  describe("evidence", () => {
    it("reports no history for a journal whose timeline starts today", () => {
      // A timeline that starts today and has already ended (a hand-edited end before its own
      // start — TimelineService.boundsOf documents this as reachable) clips every candidate
      // period away, including today's own. Without the empty-window check first, this would
      // fall through to "silent" instead of "no-history".
      const decoration = buildDecoration({ mode: "or", conditions: [wildcard], styles: [buildStyle("background")] });
      const today = date("2026-05-25").toAnchor();
      const yesterday = date("2026-05-24").toAnchor();
      const h = buildHarness({
        daily: fixedJournal(
          "daily",
          { type: "day" },
          {
            decorations: [decoration],
            timeline: { start: today, end: { kind: "date", date: yesterday } },
          },
        ),
      });

      const badge = h.service.describe({ kind: "journal", journalName: "daily" }, 0);
      expect(badge.kind).toBe("no-history");
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

  describe("units", () => {
    it("reports weeks for a weekly journal", () => {
      const decoration = buildDecoration({ mode: "or", conditions: [wildcard], styles: [buildStyle("background")] });
      const h = buildHarness({ weekly: fixedJournal("weekly", { type: "week" }, { decorations: [decoration] }) });

      const badge = expectMatched(h.service.describe({ kind: "journal", journalName: "weekly" }, 0));
      expect(badge.unit).toBe("week");
    });

    it("reports intervals for a custom journal", () => {
      // periodKindForWrite("custom") is "day"; a service that reports that raw value instead
      // of overriding to "interval" fails this.
      const decoration = buildDecoration({ mode: "or", conditions: [wildcard], styles: [buildStyle("background")] });
      const h = buildHarness({
        sprint: customJournal("sprint", "week", 2, "2020-01-06", { decorations: [decoration] }),
      });

      const badge = expectMatched(h.service.describe({ kind: "journal", journalName: "sprint" }, 0));
      expect(badge.unit).toBe("interval");
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
