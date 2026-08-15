import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";

import { CycleService } from "./cycle";
import { JournalsIndex } from "./journals-index";
import { NumberingService } from "./numbering";
import { JournalsRepository } from "./repository";
import { customJournal, fakeRepo, fixedJournal, unwrap } from "./testing";

function buildContainer(journals: Parameters<typeof fakeRepo>[0]): Container {
  const c = new Container();
  c.register(JournalsRepository).useValue(fakeRepo(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  return c;
}

describe("NumberingService", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("assignNumbers — single source", () => {
    it("returns None when enabled is false", () => {
      const c = buildContainer({ w: fixedJournal("w", { type: "week" }) });
      const n = c.resolve(NumberingService);
      expect(n.assignNumbers("w", "2024-01-01" as AnchorString).isNone()).toBe(true);
    });

    it("returns None for unknown journal", () => {
      const c = buildContainer({});
      const n = c.resolve(NumberingService);
      expect(n.assignNumbers("missing", "2024-01-01" as AnchorString).isNone()).toBe(true);
    });

    it("returns anchorValue at the anchorDate for reset.never", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const n = c.resolve(NumberingService);
      const result = n.assignNumbers("s", "2024-01-01" as AnchorString);
      expect(result.isSome() && result.value).toEqual({ index: 1 });
    });

    it("returns monotonically increasing values for reset.never", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const n = c.resolve(NumberingService);
      const result = n.assignNumbers("s", "2024-01-15" as AnchorString);
      expect(result.isSome() && result.value).toEqual({ index: 3 });
    });

    it("returns None when numbering is enabled but the anchor date is unset", () => {
      const c = buildContainer({
        w: fixedJournal(
          "w",
          { type: "week" },
          {
            numbering: {
              enabled: true,
              anchorDate: "" as AnchorString,
              allowBefore: false,
              sources: [
                {
                  variable: "index",
                  frontmatterKey: "journal-index",
                  anchorValue: 1,
                  reset: { kind: "never" },
                },
              ],
            },
          },
        ),
      });
      const n = c.resolve(NumberingService);
      expect(n.assignNumbers("w", "2024-01-15" as AnchorString).isNone()).toBe(true);
    });

    it("returns None for anchor before anchorDate when allowBefore is false", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-15") });
      const n = c.resolve(NumberingService);
      expect(n.assignNumbers("s", "2024-01-01" as AnchorString).isNone()).toBe(true);
    });

    it("cycles values for reset.after { count: 3 }", () => {
      const c = buildContainer({
        s: customJournal("s", "week", 1, "2024-01-01", {
          numbering: {
            enabled: true,
            anchorDate: "2024-01-01" as AnchorString,
            allowBefore: false,
            sources: [
              {
                variable: "index",
                frontmatterKey: "journal-index",
                anchorValue: 1,
                reset: { kind: "after", count: 3 },
              },
            ],
          },
        }),
      });
      const n = c.resolve(NumberingService);
      expect(unwrap(n.assignNumbers("s", "2024-01-01" as AnchorString))).toEqual({ index: 1 });
      expect(unwrap(n.assignNumbers("s", "2024-01-08" as AnchorString))).toEqual({ index: 2 });
      expect(unwrap(n.assignNumbers("s", "2024-01-15" as AnchorString))).toEqual({ index: 3 });
      expect(unwrap(n.assignNumbers("s", "2024-01-22" as AnchorString))).toEqual({ index: 1 });
    });

    it("returns to anchorValue rather than 0 after a full cycle for reset.after { count: 4 }", () => {
      // Post-reset value must wrap back to anchorValue (1), not collapse to 0.
      const c = buildContainer({
        s: customJournal("s", "week", 1, "2024-01-01", {
          numbering: {
            enabled: true,
            anchorDate: "2024-01-01" as AnchorString,
            allowBefore: false,
            sources: [
              {
                variable: "index",
                frontmatterKey: "journal-index",
                anchorValue: 1,
                reset: { kind: "after", count: 4 },
              },
            ],
          },
        }),
      });
      const n = c.resolve(NumberingService);
      expect(unwrap(n.assignNumbers("s", "2024-01-22" as AnchorString))).toEqual({ index: 4 });
      expect(unwrap(n.assignNumbers("s", "2024-01-29" as AnchorString))).toEqual({ index: 1 });
    });
  });

  describe("assignNumbers — start date as anchor", () => {
    it("counts from timeline.start when anchorDate is empty", () => {
      const c = buildContainer({
        s: fixedJournal(
          "s",
          { type: "month" },
          {
            timeline: { start: "2026-01-01" as AnchorString, end: { kind: "never" } },
            numbering: {
              enabled: true,
              anchorDate: "" as AnchorString,
              allowBefore: false,
              sources: [
                { variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } },
              ],
            },
          },
        ),
      });
      const n = c.resolve(NumberingService);
      expect(unwrap(n.assignNumbers("s", "2026-03-01" as AnchorString))).toEqual({ index: 3 });
    });

    it("counts from the interval containing an off-grid timeline.start rather than the raw date", () => {
      // The custom journal's grid sits on Jan 1/8/15/... but timeline.start (2024-01-03) falls
      // two days into the first interval instead of on an anchor, so this pins that the count
      // walks from the interval start (2024-01-01), not from 2024-01-03 itself.
      const c = buildContainer({
        s: customJournal("s", "week", 1, "2024-01-01", {
          timeline: { start: "2024-01-03" as AnchorString, end: { kind: "never" } },
        }),
      });
      const n = c.resolve(NumberingService);
      expect(unwrap(n.assignNumbers("s", "2024-01-15" as AnchorString))).toEqual({ index: 3 });
    });
  });

  describe("assignNumbers — multi-source cascade", () => {
    it("release stays at anchorValue for 6 sprints, then advances", () => {
      const c = buildContainer({
        s: customJournal("s", "week", 1, "2024-01-01", {
          numbering: {
            enabled: true,
            anchorDate: "2024-01-01" as AnchorString,
            allowBefore: false,
            sources: [
              { variable: "release", frontmatterKey: "journal-release", anchorValue: 4711, reset: { kind: "never" } },
              {
                variable: "sprint",
                frontmatterKey: "journal-sprint",
                anchorValue: 1,
                reset: { kind: "after", count: 6 },
              },
            ],
          },
        }),
      });
      const n = c.resolve(NumberingService);
      expect(unwrap(n.assignNumbers("s", "2024-01-01" as AnchorString))).toEqual({ release: 4711, sprint: 1 });
      expect(unwrap(n.assignNumbers("s", "2024-01-29" as AnchorString))).toEqual({ release: 4711, sprint: 5 });
      expect(unwrap(n.assignNumbers("s", "2024-02-05" as AnchorString))).toEqual({ release: 4711, sprint: 6 });
      expect(unwrap(n.assignNumbers("s", "2024-02-12" as AnchorString))).toEqual({ release: 4712, sprint: 1 });
    });

    it("outer source stays at anchorValue when inner reset is never", () => {
      const c = buildContainer({
        s: customJournal("s", "week", 1, "2024-01-01", {
          numbering: {
            enabled: true,
            anchorDate: "2024-01-01" as AnchorString,
            allowBefore: false,
            sources: [
              { variable: "phase", frontmatterKey: "journal-phase", anchorValue: 1, reset: { kind: "never" } },
              { variable: "n", frontmatterKey: "journal-n", anchorValue: 1, reset: { kind: "never" } },
            ],
          },
        }),
      });
      const n = c.resolve(NumberingService);
      expect(unwrap(n.assignNumbers("s", "2024-01-29" as AnchorString))).toEqual({ phase: 1, n: 5 });
    });
  });

  describe("assignNumbers — stored-basis", () => {
    it("uses stored numbers as cascade basis when an earlier entry has them", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2020-01-06") });

      const fresh = c.resolve(NumberingService);
      const computed = unwrap(fresh.assignNumbers("s", "2024-01-08" as AnchorString));
      expect(computed.index).toBeGreaterThan(200);

      const c2 = buildContainer({ s: customJournal("s", "week", 1, "2020-01-06") });
      const index2 = c2.resolve(JournalsIndex);
      index2.register({
        journalName: "s",
        anchor: "2024-01-01" as AnchorString,
        path: "S/X.md" as VaultPath,
        numbers: { index: 200 },
      });
      const n2 = c2.resolve(NumberingService);
      const withBasis = unwrap(n2.assignNumbers("s", "2024-01-08" as AnchorString));
      expect(withBasis).toEqual({ index: 201 });
    });

    it("advances outer source when basis sits at inner-source reset boundary", () => {
      const c = buildContainer({
        s: customJournal("s", "week", 1, "2024-01-01", {
          numbering: {
            enabled: true,
            anchorDate: "2024-01-01" as AnchorString,
            allowBefore: false,
            sources: [
              { variable: "release", frontmatterKey: "journal-release", anchorValue: 4711, reset: { kind: "never" } },
              {
                variable: "sprint",
                frontmatterKey: "journal-sprint",
                anchorValue: 1,
                reset: { kind: "after", count: 6 },
              },
            ],
          },
        }),
      });
      const index = c.resolve(JournalsIndex);
      index.register({
        journalName: "s",
        anchor: "2024-02-05" as AnchorString,
        path: "S/X.md" as VaultPath,
        numbers: { release: 4711, sprint: 6 },
      });
      const n = c.resolve(NumberingService);
      const result = n.assignNumbers("s", "2024-02-12" as AnchorString);
      expect(result.isSome() && result.value).toEqual({ release: 4712, sprint: 1 });
    });

    it("ignores a stored basis that is missing a declared variable", () => {
      const c = buildContainer({
        s: customJournal("s", "week", 1, "2024-01-01", {
          numbering: {
            enabled: true,
            anchorDate: "2024-01-01" as AnchorString,
            allowBefore: false,
            sources: [
              { variable: "release", frontmatterKey: "journal-release", anchorValue: 4711, reset: { kind: "never" } },
              {
                variable: "sprint",
                frontmatterKey: "journal-sprint",
                anchorValue: 1,
                reset: { kind: "after", count: 6 },
              },
            ],
          },
        }),
      });
      const index = c.resolve(JournalsIndex);
      // A note written before `sprint` existed: it carries `release` only.
      index.register({
        journalName: "s",
        anchor: "2024-01-29" as AnchorString,
        path: "S/old.md" as VaultPath,
        numbers: { release: 9000 },
      });
      const n = c.resolve(NumberingService);

      // Recomputed from the anchor date: 2024-02-05 is 5 weekly steps past 2024-01-01.
      expect(unwrap(n.assignNumbers("s", "2024-02-05" as AnchorString))).toEqual({ release: 4711, sprint: 6 });
    });
  });

  describe("assignNumbers — next-entry back-propagation", () => {
    it("back-computes from the nearest later entry when no earlier entry exists", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const index = c.resolve(JournalsIndex);
      index.register({
        journalName: "s",
        anchor: "2024-01-29" as AnchorString,
        path: "S/later.md" as VaultPath,
        numbers: { index: 100 },
      });
      const n = c.resolve(NumberingService);
      // Two weeks before the manually-numbered later note: 100 - 2.
      expect(unwrap(n.assignNumbers("s", "2024-01-15" as AnchorString))).toEqual({ index: 98 });
    });

    it("prefers the nearest earlier entry over a later one", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const index = c.resolve(JournalsIndex);
      index.register({
        journalName: "s",
        anchor: "2024-01-08" as AnchorString,
        path: "S/earlier.md" as VaultPath,
        numbers: { index: 10 },
      });
      index.register({
        journalName: "s",
        anchor: "2024-01-29" as AnchorString,
        path: "S/later.md" as VaultPath,
        numbers: { index: 100 },
      });
      const n = c.resolve(NumberingService);
      // One week after the earlier note (10 + 1), not derived from the later note.
      expect(unwrap(n.assignNumbers("s", "2024-01-15" as AnchorString))).toEqual({ index: 11 });
    });
  });

  describe("cache invalidation", () => {
    it("recomputes after journalDirty fires", async () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const n = c.resolve(NumberingService);
      const index = c.resolve(JournalsIndex);

      const initial = unwrap(n.assignNumbers("s", "2024-01-08" as AnchorString));
      expect(initial).toEqual({ index: 2 });

      index.register({
        journalName: "s",
        anchor: "2024-01-01" as AnchorString,
        path: "S/X.md" as VaultPath,
        numbers: { index: 100 },
      });
      await Promise.resolve();

      const recomputed = unwrap(n.assignNumbers("s", "2024-01-08" as AnchorString));
      expect(recomputed).toEqual({ index: 101 });
    });
  });

  describe("anchorForNumbers", () => {
    it("recovers the anchorDate for the anchorValue of a single non-cyclic source", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const n = c.resolve(NumberingService);
      const result = n.anchorForNumbers("s", { index: 1 });
      expect(result.isSome() && result.value).toBe("2024-01-01");
    });

    it("recovers the anchor an index maps to for a single non-cyclic source", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const n = c.resolve(NumberingService);
      const result = n.anchorForNumbers("s", { index: 3 });
      expect(result.isSome() && result.value).toBe("2024-01-15");
    });

    it("round-trips assignNumbers for an arbitrary anchor", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const n = c.resolve(NumberingService);
      const numbers = unwrap(n.assignNumbers("s", "2024-02-19" as AnchorString));
      const result = n.anchorForNumbers("s", numbers);
      expect(result.isSome() && result.value).toBe("2024-02-19");
    });

    it("returns None for cyclic numbering", () => {
      const c = buildContainer({
        s: customJournal("s", "week", 1, "2024-01-01", {
          numbering: {
            enabled: true,
            anchorDate: "2024-01-01" as AnchorString,
            allowBefore: false,
            sources: [
              {
                variable: "index",
                frontmatterKey: "journal-index",
                anchorValue: 1,
                reset: { kind: "after", count: 3 },
              },
            ],
          },
        }),
      });
      const n = c.resolve(NumberingService);
      expect(n.anchorForNumbers("s", { index: 2 }).isNone()).toBe(true);
    });

    it("returns None for multiple numbering sources", () => {
      const c = buildContainer({
        s: customJournal("s", "week", 1, "2024-01-01", {
          numbering: {
            enabled: true,
            anchorDate: "2024-01-01" as AnchorString,
            allowBefore: false,
            sources: [
              { variable: "phase", frontmatterKey: "journal-phase", anchorValue: 1, reset: { kind: "never" } },
              { variable: "n", frontmatterKey: "journal-n", anchorValue: 1, reset: { kind: "never" } },
            ],
          },
        }),
      });
      const n = c.resolve(NumberingService);
      expect(n.anchorForNumbers("s", { phase: 1, n: 5 }).isNone()).toBe(true);
    });

    it("inverts a two-digit odometer back to its anchor", () => {
      const c = buildContainer({
        s: customJournal("s", "week", 1, "2024-01-01", {
          numbering: {
            enabled: true,
            anchorDate: "2024-01-01" as AnchorString,
            allowBefore: false,
            sources: [
              { variable: "release", frontmatterKey: "journal-release", anchorValue: 4711, reset: { kind: "never" } },
              {
                variable: "sprint",
                frontmatterKey: "journal-sprint",
                anchorValue: 1,
                reset: { kind: "after", count: 6 },
              },
            ],
          },
        }),
      });
      const n = c.resolve(NumberingService);

      // (4712 - 4711) * 6 + (3 - 1) = 8 weekly steps past 2024-01-01.
      expect(unwrap(n.anchorForNumbers("s", { release: 4712, sprint: 3 }))).toBe("2024-02-26");
      expect(unwrap(n.anchorForNumbers("s", { release: 4711, sprint: 1 }))).toBe("2024-01-01");
    });

    it("returns None when a declared digit is absent from the numbers", () => {
      const c = buildContainer({
        s: customJournal("s", "week", 1, "2024-01-01", {
          numbering: {
            enabled: true,
            anchorDate: "2024-01-01" as AnchorString,
            allowBefore: false,
            sources: [
              { variable: "release", frontmatterKey: "journal-release", anchorValue: 4711, reset: { kind: "never" } },
              {
                variable: "sprint",
                frontmatterKey: "journal-sprint",
                anchorValue: 1,
                reset: { kind: "after", count: 6 },
              },
            ],
          },
        }),
      });
      const n = c.resolve(NumberingService);

      expect(n.anchorForNumbers("s", { release: 4712 }).isNone()).toBe(true);
    });

    it("returns None for an inner digit outside its cycle rather than wrapping it", () => {
      const c = buildContainer({
        s: customJournal("s", "week", 1, "2024-01-01", {
          numbering: {
            enabled: true,
            anchorDate: "2024-01-01" as AnchorString,
            allowBefore: false,
            sources: [
              { variable: "release", frontmatterKey: "journal-release", anchorValue: 4711, reset: { kind: "never" } },
              {
                variable: "sprint",
                frontmatterKey: "journal-sprint",
                anchorValue: 1,
                reset: { kind: "after", count: 6 },
              },
            ],
          },
        }),
      });
      const n = c.resolve(NumberingService);

      // Wrapping would land Sprint9 on the same anchor as Release4712Sprint3 and let two
      // notes attach to one period.
      expect(n.anchorForNumbers("s", { release: 4711, sprint: 9 }).isNone()).toBe(true);
    });

    it("recovers an anchor via timeline.start when anchorDate is empty", () => {
      const c = buildContainer({
        s: fixedJournal(
          "s",
          { type: "month" },
          {
            timeline: { start: "2026-01-01" as AnchorString, end: { kind: "never" } },
            numbering: {
              enabled: true,
              anchorDate: "" as AnchorString,
              allowBefore: false,
              sources: [
                { variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } },
              ],
            },
          },
        ),
      });
      const n = c.resolve(NumberingService);
      const result = n.anchorForNumbers("s", { index: 3 });
      expect(result.isSome() && result.value).toBe("2026-03-01");
    });

    it("returns None when numbering is disabled", () => {
      const c = buildContainer({ w: fixedJournal("w", { type: "week" }) });
      const n = c.resolve(NumberingService);
      expect(n.anchorForNumbers("w", { index: 3 }).isNone()).toBe(true);
    });

    it("returns None when the captured numbers omit the source variable", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const n = c.resolve(NumberingService);
      expect(n.anchorForNumbers("s", { other: 3 }).isNone()).toBe(true);
    });

    it("returns None for an unknown journal", () => {
      const c = buildContainer({});
      const n = c.resolve(NumberingService);
      expect(n.anchorForNumbers("missing", { index: 3 }).isNone()).toBe(true);
    });

    it("returns None for an index before the anchorValue when allowBefore is false", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-15") });
      const n = c.resolve(NumberingService);
      expect(n.anchorForNumbers("s", { index: 0 }).isNone()).toBe(true);
    });

    it("recovers an earlier anchor for an index below the anchorValue when allowBefore is true", () => {
      const c = buildContainer({
        s: customJournal("s", "week", 1, "2024-01-15", {
          numbering: {
            enabled: true,
            anchorDate: "2024-01-15" as AnchorString,
            allowBefore: true,
            sources: [{ variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } }],
          },
        }),
      });
      const n = c.resolve(NumberingService);
      const result = n.anchorForNumbers("s", { index: -1 });
      expect(result.isSome() && result.value).toBe("2024-01-01");
    });
  });
});
