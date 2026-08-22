import { beforeEach, describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";
import { testContainer, type TestHarness } from "@/testing";

import { JournalsIndex } from "./journals-index";
import { journalsCoreModule } from "./module";
import { invertibleNumberingVariables, NumberingService } from "./numbering";
import { customJournal, fixedJournal, unwrap } from "./testing";

import type { JournalNumberingConfig, NumberingSource } from "./config";

type DigitSpec = "never" | number;

function sourcesFrom(specs: readonly DigitSpec[]): NumberingSource[] {
  return specs.map((spec, i) => ({
    variable: `v${i}`,
    frontmatterKey: `journal-v${i}`,
    anchorValue: 1,
    reset: spec === "never" ? ({ kind: "never" } as const) : ({ kind: "after", count: spec } as const),
  }));
}

describe("invertibleNumberingVariables", () => {
  const cases: { label: string; specs: DigitSpec[]; expected: readonly string[] | null }[] = [
    { label: "[never]", specs: ["never"], expected: ["v0"] },
    { label: "[after 26]", specs: [26], expected: null },
    { label: "[never, after 6]", specs: ["never", 6], expected: ["v0", "v1"] },
    { label: "[after 4, after 6]", specs: [4, 6], expected: null },
    { label: "[never, after 4, after 3]", specs: ["never", 4, 3], expected: ["v0", "v1", "v2"] },
    { label: "[after 4, never]", specs: [4, "never"], expected: null },
    { label: "[never, never]", specs: ["never", "never"], expected: null },
    { label: "[never, never, after 6]", specs: ["never", "never", 6], expected: null },
  ];

  it.each(cases)("$label", ({ specs, expected }) => {
    const numbering: JournalNumberingConfig = {
      enabled: true,
      anchorDate: "2024-01-01" as AnchorString,
      allowBefore: false,
      sources: sourcesFrom(specs),
    };
    expect(invertibleNumberingVariables(numbering)).toEqual(expected);
  });
});

describe("NumberingService", () => {
  describe("assignNumbers — single source", () => {
    it("returns None when enabled is false", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { w: fixedJournal("w", { type: "week" }) } },
      });
      const n = resolve(NumberingService);
      expect(n.assignNumbers("w", "2024-01-01" as AnchorString).isNone()).toBe(true);
    });

    it("returns None for unknown journal", async () => {
      const { resolve } = await testContainer({ modules: [journalsCoreModule], data: { journals: {} } });
      const n = resolve(NumberingService);
      expect(n.assignNumbers("missing", "2024-01-01" as AnchorString).isNone()).toBe(true);
    });

    describe("custom weekly journal anchored 2024-01-01", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: { journals: { s: customJournal("s", "week", 1, "2024-01-01") } },
        });
      });

      it("returns anchorValue at the anchorDate for reset.never", () => {
        const n = harness.resolve(NumberingService);
        const result = n.assignNumbers("s", "2024-01-01" as AnchorString);
        expect(result.isSome() && result.value).toEqual({ index: 1 });
      });

      it("returns monotonically increasing values for reset.never", () => {
        const n = harness.resolve(NumberingService);
        const result = n.assignNumbers("s", "2024-01-15" as AnchorString);
        expect(result.isSome() && result.value).toEqual({ index: 3 });
      });
    });

    it("returns None when numbering is enabled but the anchor date is unset", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
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
          },
        },
      });
      const n = resolve(NumberingService);
      expect(n.assignNumbers("w", "2024-01-15" as AnchorString).isNone()).toBe(true);
    });

    it("returns None for anchor before anchorDate when allowBefore is false", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { s: customJournal("s", "week", 1, "2024-01-15") } },
      });
      const n = resolve(NumberingService);
      expect(n.assignNumbers("s", "2024-01-01" as AnchorString).isNone()).toBe(true);
    });

    it("cycles values for reset.after { count: 3 }", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
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
          },
        },
      });
      const n = resolve(NumberingService);
      expect(unwrap(n.assignNumbers("s", "2024-01-01" as AnchorString))).toEqual({ index: 1 });
      expect(unwrap(n.assignNumbers("s", "2024-01-08" as AnchorString))).toEqual({ index: 2 });
      expect(unwrap(n.assignNumbers("s", "2024-01-15" as AnchorString))).toEqual({ index: 3 });
      expect(unwrap(n.assignNumbers("s", "2024-01-22" as AnchorString))).toEqual({ index: 1 });
    });

    it("returns to anchorValue rather than 0 after a full cycle for reset.after { count: 4 }", async () => {
      // Post-reset value must wrap back to anchorValue (1), not collapse to 0.
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
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
          },
        },
      });
      const n = resolve(NumberingService);
      expect(unwrap(n.assignNumbers("s", "2024-01-22" as AnchorString))).toEqual({ index: 4 });
      expect(unwrap(n.assignNumbers("s", "2024-01-29" as AnchorString))).toEqual({ index: 1 });
    });
  });

  describe("assignNumbers — start date as anchor", () => {
    it("counts from timeline.start when anchorDate is empty", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
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
          },
        },
      });
      const n = resolve(NumberingService);
      expect(unwrap(n.assignNumbers("s", "2026-03-01" as AnchorString))).toEqual({ index: 3 });
    });

    it("counts from the interval containing an off-grid timeline.start rather than the raw date", async () => {
      // The custom journal's grid sits on Jan 1/8/15/... but timeline.start (2024-01-03) falls
      // two days into the first interval instead of on an anchor, so this pins that the count
      // walks from the interval start (2024-01-01), not from 2024-01-03 itself.
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            s: customJournal("s", "week", 1, "2024-01-01", {
              timeline: { start: "2024-01-03" as AnchorString, end: { kind: "never" } },
            }),
          },
        },
      });
      const n = resolve(NumberingService);
      expect(unwrap(n.assignNumbers("s", "2024-01-15" as AnchorString))).toEqual({ index: 3 });
    });
  });

  describe("assignNumbers — multi-source cascade", () => {
    it("release stays at anchorValue for 6 sprints, then advances", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            s: customJournal("s", "week", 1, "2024-01-01", {
              numbering: {
                enabled: true,
                anchorDate: "2024-01-01" as AnchorString,
                allowBefore: false,
                sources: [
                  {
                    variable: "release",
                    frontmatterKey: "journal-release",
                    anchorValue: 4711,
                    reset: { kind: "never" },
                  },
                  {
                    variable: "sprint",
                    frontmatterKey: "journal-sprint",
                    anchorValue: 1,
                    reset: { kind: "after", count: 6 },
                  },
                ],
              },
            }),
          },
        },
      });
      const n = resolve(NumberingService);
      expect(unwrap(n.assignNumbers("s", "2024-01-01" as AnchorString))).toEqual({ release: 4711, sprint: 1 });
      expect(unwrap(n.assignNumbers("s", "2024-01-29" as AnchorString))).toEqual({ release: 4711, sprint: 5 });
      expect(unwrap(n.assignNumbers("s", "2024-02-05" as AnchorString))).toEqual({ release: 4711, sprint: 6 });
      expect(unwrap(n.assignNumbers("s", "2024-02-12" as AnchorString))).toEqual({ release: 4712, sprint: 1 });
    });

    it("carries through a middle digit across a three-digit cascade", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            s: customJournal("s", "week", 1, "2024-01-01", {
              numbering: {
                enabled: true,
                anchorDate: "2024-01-01" as AnchorString,
                allowBefore: false,
                sources: [
                  { variable: "phase", frontmatterKey: "journal-phase", anchorValue: 1, reset: { kind: "never" } },
                  {
                    variable: "tier",
                    frontmatterKey: "journal-tier",
                    anchorValue: 1,
                    reset: { kind: "after", count: 4 },
                  },
                  {
                    variable: "unit",
                    frontmatterKey: "journal-unit",
                    anchorValue: 1,
                    reset: { kind: "after", count: 3 },
                  },
                ],
              },
            }),
          },
        },
      });
      const n = resolve(NumberingService);
      expect(unwrap(n.assignNumbers("s", "2024-01-01" as AnchorString))).toEqual({ phase: 1, tier: 1, unit: 1 });
      // Step 11: tier has wrapped 3 times (0..3, each 3 units) without reaching its own count
      // of 4, so tier itself is mid-cycle and phase hasn't carried yet.
      expect(unwrap(n.assignNumbers("s", "2024-03-18" as AnchorString))).toEqual({ phase: 1, tier: 4, unit: 3 });
      // Step 13: tier has now wrapped a 4th time (crossing its own count), handing a carry up
      // to phase — the middle-index innerResetsCrossed-feeds-sourceSteps handoff.
      expect(unwrap(n.assignNumbers("s", "2024-04-01" as AnchorString))).toEqual({ phase: 2, tier: 1, unit: 2 });
    });

    it("outer source stays at anchorValue when inner reset is never", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
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
          },
        },
      });
      const n = resolve(NumberingService);
      expect(unwrap(n.assignNumbers("s", "2024-01-29" as AnchorString))).toEqual({ phase: 1, n: 5 });
    });

    it("borrows from the outer digit for a negative step across the inner reset boundary", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            s: customJournal("s", "week", 1, "2024-02-05", {
              numbering: {
                enabled: true,
                anchorDate: "2024-02-05" as AnchorString,
                allowBefore: true,
                sources: [
                  {
                    variable: "release",
                    frontmatterKey: "journal-release",
                    anchorValue: 4711,
                    reset: { kind: "never" },
                  },
                  {
                    variable: "sprint",
                    frontmatterKey: "journal-sprint",
                    anchorValue: 1,
                    reset: { kind: "after", count: 6 },
                  },
                ],
              },
            }),
          },
        },
      });
      const n = resolve(NumberingService);
      // One week before the anchor: sprint borrows down from 1 to 6, and release borrows down
      // from 4711 to 4710 — the odometer's negative-steps counterpart to carrying up.
      expect(unwrap(n.assignNumbers("s", "2024-01-29" as AnchorString))).toEqual({ release: 4710, sprint: 6 });
    });
  });

  describe("assignNumbers — stored-basis", () => {
    it("uses stored numbers as cascade basis when an earlier entry has them", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { s: customJournal("s", "week", 1, "2020-01-06") } },
      });

      const fresh = resolve(NumberingService);
      const computed = unwrap(fresh.assignNumbers("s", "2024-01-08" as AnchorString));
      expect(computed.index).toBeGreaterThan(200);

      const { resolve: resolve2 } = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { s: customJournal("s", "week", 1, "2020-01-06") } },
      });
      const index2 = resolve2(JournalsIndex);
      index2.register({
        journalName: "s",
        anchor: "2024-01-01" as AnchorString,
        path: "S/X.md" as VaultPath,
        numbers: { index: 200 },
      });
      const n2 = resolve2(NumberingService);
      const withBasis = unwrap(n2.assignNumbers("s", "2024-01-08" as AnchorString));
      expect(withBasis).toEqual({ index: 201 });
    });

    describe("release/sprint two-digit odometer anchored 2024-01-01", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: {
            journals: {
              s: customJournal("s", "week", 1, "2024-01-01", {
                numbering: {
                  enabled: true,
                  anchorDate: "2024-01-01" as AnchorString,
                  allowBefore: false,
                  sources: [
                    {
                      variable: "release",
                      frontmatterKey: "journal-release",
                      anchorValue: 4711,
                      reset: { kind: "never" },
                    },
                    {
                      variable: "sprint",
                      frontmatterKey: "journal-sprint",
                      anchorValue: 1,
                      reset: { kind: "after", count: 6 },
                    },
                  ],
                },
              }),
            },
          },
        });
      });

      it("advances outer source when basis sits at inner-source reset boundary", () => {
        harness.resolve(JournalsIndex).register({
          journalName: "s",
          anchor: "2024-02-05" as AnchorString,
          path: "S/X.md" as VaultPath,
          numbers: { release: 4711, sprint: 6 },
        });
        const n = harness.resolve(NumberingService);
        const result = n.assignNumbers("s", "2024-02-12" as AnchorString);
        expect(result.isSome() && result.value).toEqual({ release: 4712, sprint: 1 });
      });

      it("ignores a stored basis that is missing a declared variable", () => {
        // A note written before `sprint` existed: it carries `release` only.
        harness.resolve(JournalsIndex).register({
          journalName: "s",
          anchor: "2024-01-29" as AnchorString,
          path: "S/old.md" as VaultPath,
          numbers: { release: 9000 },
        });
        const n = harness.resolve(NumberingService);

        // Recomputed from the anchor date: 2024-02-05 is 5 weekly steps past 2024-01-01.
        expect(unwrap(n.assignNumbers("s", "2024-02-05" as AnchorString))).toEqual({ release: 4711, sprint: 6 });
      });
    });
  });

  describe("assignNumbers — next-entry back-propagation", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { s: customJournal("s", "week", 1, "2024-01-01") } },
      });
    });

    it("back-computes from the nearest later entry when no earlier entry exists", () => {
      harness.resolve(JournalsIndex).register({
        journalName: "s",
        anchor: "2024-01-29" as AnchorString,
        path: "S/later.md" as VaultPath,
        numbers: { index: 100 },
      });
      const n = harness.resolve(NumberingService);
      // Two weeks before the manually-numbered later note: 100 - 2.
      expect(unwrap(n.assignNumbers("s", "2024-01-15" as AnchorString))).toEqual({ index: 98 });
    });

    it("prefers the nearest earlier entry over a later one", () => {
      const index = harness.resolve(JournalsIndex);
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
      const n = harness.resolve(NumberingService);
      // One week after the earlier note (10 + 1), not derived from the later note.
      expect(unwrap(n.assignNumbers("s", "2024-01-15" as AnchorString))).toEqual({ index: 11 });
    });
  });

  describe("cache invalidation", () => {
    it("recomputes after journalDirty fires", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { s: customJournal("s", "week", 1, "2024-01-01") } },
      });
      const n = resolve(NumberingService);
      const index = resolve(JournalsIndex);

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
    describe("plain custom weekly journal anchored 2024-01-01", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: { journals: { s: customJournal("s", "week", 1, "2024-01-01") } },
        });
      });

      it("recovers the anchorDate for the anchorValue of a single non-cyclic source", () => {
        const n = harness.resolve(NumberingService);
        const result = n.anchorForNumbers("s", { index: 1 });
        expect(result.isSome() && result.value).toBe("2024-01-01");
      });

      it("recovers the anchor an index maps to for a single non-cyclic source", () => {
        const n = harness.resolve(NumberingService);
        const result = n.anchorForNumbers("s", { index: 3 });
        expect(result.isSome() && result.value).toBe("2024-01-15");
      });

      it("round-trips assignNumbers for an arbitrary anchor", () => {
        const n = harness.resolve(NumberingService);
        const numbers = unwrap(n.assignNumbers("s", "2024-02-19" as AnchorString));
        const result = n.anchorForNumbers("s", numbers);
        expect(result.isSome() && result.value).toBe("2024-02-19");
      });

      it("returns None when the captured numbers omit the source variable", () => {
        const n = harness.resolve(NumberingService);
        expect(n.anchorForNumbers("s", { other: 3 }).isNone()).toBe(true);
      });
    });

    it("returns None for cyclic numbering", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
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
          },
        },
      });
      const n = resolve(NumberingService);
      expect(n.anchorForNumbers("s", { index: 2 }).isNone()).toBe(true);
    });

    it("returns None when a non-top source has a never reset", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
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
          },
        },
      });
      const n = resolve(NumberingService);
      expect(n.anchorForNumbers("s", { phase: 1, n: 5 }).isNone()).toBe(true);
    });

    describe("release/sprint two-digit odometer anchored 2024-01-01", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: {
            journals: {
              s: customJournal("s", "week", 1, "2024-01-01", {
                numbering: {
                  enabled: true,
                  anchorDate: "2024-01-01" as AnchorString,
                  allowBefore: false,
                  sources: [
                    {
                      variable: "release",
                      frontmatterKey: "journal-release",
                      anchorValue: 4711,
                      reset: { kind: "never" },
                    },
                    {
                      variable: "sprint",
                      frontmatterKey: "journal-sprint",
                      anchorValue: 1,
                      reset: { kind: "after", count: 6 },
                    },
                  ],
                },
              }),
            },
          },
        });
      });

      it("inverts a two-digit odometer back to its anchor", () => {
        const n = harness.resolve(NumberingService);

        // (4712 - 4711) * 6 + (3 - 1) = 8 weekly steps past 2024-01-01.
        expect(unwrap(n.anchorForNumbers("s", { release: 4712, sprint: 3 }))).toBe("2024-02-26");
        expect(unwrap(n.anchorForNumbers("s", { release: 4711, sprint: 1 }))).toBe("2024-01-01");
      });

      it("returns None when a declared digit is absent from the numbers", () => {
        const n = harness.resolve(NumberingService);

        expect(n.anchorForNumbers("s", { release: 4712 }).isNone()).toBe(true);
      });

      it("returns None for an inner digit outside its cycle rather than wrapping it", () => {
        const n = harness.resolve(NumberingService);

        // Wrapping would land Sprint9 on the same anchor as Release4712Sprint3 and let two
        // notes attach to one period.
        expect(n.anchorForNumbers("s", { release: 4711, sprint: 9 }).isNone()).toBe(true);
      });
    });

    it("recovers an anchor via timeline.start when anchorDate is empty", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
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
          },
        },
      });
      const n = resolve(NumberingService);
      const result = n.anchorForNumbers("s", { index: 3 });
      expect(result.isSome() && result.value).toBe("2026-03-01");
    });

    it("returns None when numbering is disabled", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { w: fixedJournal("w", { type: "week" }) } },
      });
      const n = resolve(NumberingService);
      expect(n.anchorForNumbers("w", { index: 3 }).isNone()).toBe(true);
    });

    it("returns None for an unknown journal", async () => {
      const { resolve } = await testContainer({ modules: [journalsCoreModule], data: { journals: {} } });
      const n = resolve(NumberingService);
      expect(n.anchorForNumbers("missing", { index: 3 }).isNone()).toBe(true);
    });

    it("returns None for an index before the anchorValue when allowBefore is false", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { s: customJournal("s", "week", 1, "2024-01-15") } },
      });
      const n = resolve(NumberingService);
      expect(n.anchorForNumbers("s", { index: 0 }).isNone()).toBe(true);
    });

    it("recovers an earlier anchor for an index below the anchorValue when allowBefore is true", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            s: customJournal("s", "week", 1, "2024-01-15", {
              numbering: {
                enabled: true,
                anchorDate: "2024-01-15" as AnchorString,
                allowBefore: true,
                sources: [
                  { variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } },
                ],
              },
            }),
          },
        },
      });
      const n = resolve(NumberingService);
      const result = n.anchorForNumbers("s", { index: -1 });
      expect(result.isSome() && result.value).toBe("2024-01-01");
    });
  });
});
