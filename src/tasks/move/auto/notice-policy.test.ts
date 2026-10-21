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
const named = (notice: string, journal = "daily"): string => m.tasks_auto_roll_prefix({ journal, notice });

describe("noticeFor", () => {
  it("shows the rolled sentence on every roll", () => {
    const seen = new Set<string>();

    expect(noticeFor(rolled, seen)).toBe(named(done));
    expect(noticeFor(rolled, seen)).toBe(named(done));
  });

  it("shows a warning once per source and kind", () => {
    const seen = new Set<string>();
    const missing = (at: string): RollReport =>
      reportOf({ read: [anchor(at)], missingHeading: [anchor(at)], heading: "Tasks", unreadSources: [] });
    const unread = reportOf({ read: [anchor("2026-10-20")], unreadSources: [anchor("2026-10-20")] });

    expect(noticeFor(missing("2026-10-20"), seen)).toBe(
      named(m.tasks_roll_missing_heading({ heading: "Tasks", date: "2026-10-20" })),
    );
    expect(noticeFor(missing("2026-10-20"), seen)).toBeNull();
    expect(noticeFor(unread, seen)).toBe(named(m.tasks_roll_source_unread({ date: "2026-10-20" })));
    expect(noticeFor(missing("2026-10-21"), seen)).toBe(
      named(m.tasks_roll_missing_heading({ heading: "Tasks", date: "2026-10-21" })),
    );
  });

  it("keeps the rolled sentence and drops a warning already shown", () => {
    const seen = new Set<string>();
    const withChange = reportOf({
      ...rolled,
      changedSources: [{ path: "daily/2026-10-20.md" as VaultPath, anchor: anchor("2026-10-20") }],
    });
    const changed = m.tasks_roll_source_changed({ date: "2026-10-20", mode: "move" });

    expect(noticeFor(withChange, seen)).toBe(named(`${done} ${changed}`));
    expect(noticeFor(withChange, seen)).toBe(named(done));
  });

  it("announces a count once per note, however the look-back shifts", () => {
    const seen = new Set<string>();

    expect(noticeFor(blockIds(["2026-10-19", "2026-10-20"], { "2026-10-20": 1 }), seen)).toBe(
      named(m.tasks_roll_block_ids_skipped({ count: 1 })),
    );
    expect(noticeFor(blockIds(["2026-10-20", "2026-10-21"], { "2026-10-20": 1 }), seen)).toBeNull();
    expect(noticeFor(blockIds(["2026-10-20", "2026-10-21"], { "2026-10-20": 1, "2026-10-21": 2 }), seen)).toBe(
      named(m.tasks_roll_block_ids_skipped({ count: 2 })),
    );
  });

  it("announces skipped task notes once per note", () => {
    const seen = new Set<string>();

    expect(noticeFor(noteItems(["2026-10-20"], "2026-10-20", 3), seen)).toBe(
      named(m.tasks_roll_note_items_skipped({ count: 3 })),
    );
    expect(noticeFor(noteItems(["2026-10-20", "2026-10-21"], "2026-10-20", 3), seen)).toBeNull();
  });

  it("says nothing about a roll that found nothing", () => {
    const seen = new Set<string>();

    expect(noticeFor(reportOf({ read: [anchor("2026-10-20")] }), seen)).toBeNull();
    expect(noticeFor(reportOf({ noPrevious: true }), seen)).toBeNull();
    expect(seen.size).toBe(0);
  });

  it("keys warnings by journal", () => {
    const seen = new Set<string>();

    expect(noticeFor(unreadIn("daily"), seen)).not.toBeNull();
    expect(noticeFor(unreadIn("work"), seen)).not.toBeNull();
  });

  it("an earlier note still indexing is said in the automatic wording", () => {
    const indexing = reportOf({ read: [anchor("2026-10-20")], skippedSources: [anchor("2026-10-20")] });

    expect(noticeFor(indexing, new Set())).toBe(named(m.tasks_auto_roll_source_indexing({ date: "2026-10-20" })));
  });

  it("leaves out the kinds it is told to, keeping the rest", () => {
    const seen = new Set<string>();
    const path = "daily/2026-10-20.md" as VaultPath;
    const unwritten = reportOf({
      ...rolled,
      read: [anchor("2026-10-19"), anchor("2026-10-20")],
      unreadSources: [anchor("2026-10-19")],
      changedSources: [{ path, anchor: anchor("2026-10-20") }],
      failedSources: [{ path, anchor: anchor("2026-10-20") }],
    });

    expect(noticeFor(unwritten, seen, new Set(["source-changed", "source-write-failed"]))).toBe(
      named(`${done} ${m.tasks_roll_source_unread({ date: "2026-10-19" })}`),
    );
  });

  it("names the journal even when it is the only one", () => {
    expect(noticeFor(rolled, new Set())).toBe(named(done));
    expect(noticeFor(reportOf({ ...rolled, journalName: "work" }), new Set())).toBe(named(done, "work"));
  });
});
