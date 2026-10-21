import { describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import type { VaultPath } from "@/infrastructure/host";

import { noticeFor } from "./notice-policy";

import type { RollReport } from "../report";

function reportOf(overrides: Partial<RollReport>): RollReport {
  return {
    journalName: "daily",
    mode: "move",
    rolled: 0,
    notes: 0,
    sources: [],
    read: [],
    noPrevious: false,
    noTarget: false,
    missingHeading: [],
    heading: null,
    skippedNoteItems: 0,
    skippedBlockIds: 0,
    skippedNoteItemsAt: [],
    skippedBlockIdsAt: [],
    changedSources: [],
    failedSources: [],
    skippedSources: [],
    unreadSources: [],
    ...overrides,
  };
}

const blockIds = (read: readonly string[], at: Record<string, number>): RollReport => {
  const counts = Object.entries(at).map(([date, count]) => ({ anchor: anchor(date), count }));
  return reportOf({
    read: read.map((date) => anchor(date)),
    skippedBlockIds: counts.reduce((total, { count }) => total + count, 0),
    skippedBlockIdsAt: counts,
  });
};
const unreadIn = (journalName: string): RollReport =>
  reportOf({ journalName, read: [anchor("2026-10-20")], unreadSources: [anchor("2026-10-20")] });

const noteItems = (read: readonly string[], at: string, count: number): RollReport =>
  reportOf({
    read: read.map((date) => anchor(date)),
    skippedNoteItems: count,
    skippedNoteItemsAt: [{ anchor: anchor(at), count }],
  });

const rolled = reportOf({ rolled: 2, notes: 1, sources: [anchor("2026-10-20")], read: [anchor("2026-10-20")] });
const done = m.tasks_roll_done({ count: 2, notes: 1, oldest: "2026-10-20" });

describe("noticeFor", () => {
  it("shows the rolled sentence on every roll", () => {
    const seen = new Set<string>();

    expect(noticeFor(rolled, seen, false)).toBe(done);
    expect(noticeFor(rolled, seen, false)).toBe(done);
  });

  it("shows a warning once per source and kind", () => {
    const seen = new Set<string>();
    const missing = (at: string): RollReport =>
      reportOf({ read: [anchor(at)], missingHeading: [anchor(at)], heading: "Tasks", unreadSources: [] });
    const unread = reportOf({ read: [anchor("2026-10-20")], unreadSources: [anchor("2026-10-20")] });

    expect(noticeFor(missing("2026-10-20"), seen, false)).toBe(
      m.tasks_roll_missing_heading({ heading: "Tasks", date: "2026-10-20" }),
    );
    expect(noticeFor(missing("2026-10-20"), seen, false)).toBeNull();
    expect(noticeFor(unread, seen, false)).toBe(m.tasks_roll_source_unread({ date: "2026-10-20" }));
    expect(noticeFor(missing("2026-10-21"), seen, false)).toBe(
      m.tasks_roll_missing_heading({ heading: "Tasks", date: "2026-10-21" }),
    );
  });

  it("keeps the rolled sentence and drops a warning already shown", () => {
    const seen = new Set<string>();
    const withChange = reportOf({
      ...rolled,
      changedSources: [{ path: "daily/2026-10-20.md" as VaultPath, anchor: anchor("2026-10-20") }],
    });
    const changed = m.tasks_roll_source_changed({ date: "2026-10-20", mode: "move" });

    expect(noticeFor(withChange, seen, false)).toBe(`${done} ${changed}`);
    expect(noticeFor(withChange, seen, false)).toBe(done);
  });

  it("announces a count once per note, however the look-back shifts", () => {
    const seen = new Set<string>();

    expect(noticeFor(blockIds(["2026-10-19", "2026-10-20"], { "2026-10-20": 1 }), seen, false)).toBe(
      m.tasks_roll_block_ids_skipped({ count: 1 }),
    );
    expect(noticeFor(blockIds(["2026-10-20", "2026-10-21"], { "2026-10-20": 1 }), seen, false)).toBeNull();
    expect(noticeFor(blockIds(["2026-10-20", "2026-10-21"], { "2026-10-20": 1, "2026-10-21": 2 }), seen, false)).toBe(
      m.tasks_roll_block_ids_skipped({ count: 2 }),
    );
  });

  it("announces skipped task notes once per note", () => {
    const seen = new Set<string>();

    expect(noticeFor(noteItems(["2026-10-20"], "2026-10-20", 3), seen, false)).toBe(
      m.tasks_roll_note_items_skipped({ count: 3 }),
    );
    expect(noticeFor(noteItems(["2026-10-20", "2026-10-21"], "2026-10-20", 3), seen, false)).toBeNull();
  });

  it("says nothing about a roll that found nothing", () => {
    const seen = new Set<string>();

    expect(noticeFor(reportOf({ read: [anchor("2026-10-20")] }), seen, false)).toBeNull();
    expect(noticeFor(reportOf({ noPrevious: true }), seen, false)).toBeNull();
    expect(seen.size).toBe(0);
  });

  it("keys warnings by journal", () => {
    const seen = new Set<string>();

    expect(noticeFor(unreadIn("daily"), seen, false)).not.toBeNull();
    expect(noticeFor(unreadIn("work"), seen, false)).not.toBeNull();
  });

  it("prefixes the journal's name when asked", () => {
    expect(noticeFor(rolled, new Set(), true)).toBe(m.tasks_auto_roll_prefix({ journal: "daily", notice: done }));
  });
});
