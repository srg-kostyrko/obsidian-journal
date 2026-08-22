import { beforeEach, describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";
import { testContainer, type TestHarness } from "@/testing";

import { FrontmatterService } from "./frontmatter";
import { JournalsIndex } from "./journals-index";
import { journalsCoreModule } from "./module";
import { customJournal, fixedJournal } from "./testing";

import type { JournalConfig } from "./config";

describe("FrontmatterService", () => {
  describe("parseEntry", () => {
    describe("fixed daily journal", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
        });
      });

      it("returns Some(entry) for valid frontmatter with a known journal", () => {
        const fm = harness.resolve(FrontmatterService);
        const result = fm.parseEntry("D/2024-01-01.md" as VaultPath, {
          journal: "daily",
          "journal-date": "2024-01-01",
        });
        expect(result.isSome() && result.value).toEqual({
          journalName: "daily",
          anchor: "2024-01-01",
          path: "D/2024-01-01.md",
        });
      });

      it("returns None when the journal key is missing", () => {
        const fm = harness.resolve(FrontmatterService);
        expect(fm.parseEntry("X.md" as VaultPath, { "journal-date": "2024-01-01" }).isNone()).toBe(true);
      });

      it("returns None when the date field is invalid", () => {
        const fm = harness.resolve(FrontmatterService);
        expect(fm.parseEntry("X.md" as VaultPath, { journal: "daily", "journal-date": "not-a-date" }).isNone()).toBe(
          true,
        );
      });

      it("accepts any date for a fixed daily note", () => {
        const fm = harness.resolve(FrontmatterService);
        const result = fm.parseEntry("D/x.md" as VaultPath, { journal: "daily", "journal-date": "2024-06-15" });
        expect(result.isSome()).toBe(true);
      });
    });

    it("returns None when the journal is unknown", async () => {
      const { resolve } = await testContainer({ modules: [journalsCoreModule], data: { journals: {} } });
      const fm = resolve(FrontmatterService);
      expect(fm.parseEntry("X.md" as VaultPath, { journal: "missing", "journal-date": "2024-01-01" }).isNone()).toBe(
        true,
      );
    });

    it("includes endDate when present and valid", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            s: customJournal("s", "week", 1, "2024-01-01", {
              frontmatter: {
                dateField: "journal-date",
                startDateField: "journal-start-date",
                endDateField: "journal-end-date",
                addStartDate: false,
                addEndDate: true,
              },
            }),
          },
        },
      });
      const fm = resolve(FrontmatterService);
      const result = fm.parseEntry("S/1.md" as VaultPath, {
        journal: "s",
        "journal-date": "2024-01-01",
        "journal-end-date": "2024-01-14",
      });
      expect(result.isSome() && result.value.endDate).toBe("2024-01-14");
    });

    describe("custom weekly journal", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: { journals: { s: customJournal("s", "week", 1, "2024-01-01") } },
        });
      });

      it("ignores invalid endDate but keeps the entry", () => {
        const fm = harness.resolve(FrontmatterService);
        const result = fm.parseEntry("S/1.md" as VaultPath, {
          journal: "s",
          "journal-date": "2024-01-01",
          "journal-end-date": "not-a-date",
        });
        expect(result.isSome() && result.value.endDate).toBeUndefined();
      });

      it("includes the numbers dictionary keyed by source variable", () => {
        const fm = harness.resolve(FrontmatterService);
        const result = fm.parseEntry("S/1.md" as VaultPath, {
          journal: "s",
          "journal-date": "2024-01-01",
          "journal-index": 5,
        });
        expect(result.isSome() && result.value.numbers).toEqual({ index: 5 });
      });

      it("still adopts an off-grid custom note at parse time (validated later)", () => {
        const fm = harness.resolve(FrontmatterService);
        const result = fm.parseEntry("S/x.md" as VaultPath, { journal: "s", "journal-date": "2024-01-03" });
        expect(result.isSome()).toBe(true);
      });
    });

    it("includes only the present number fields for multi-source numbering", async () => {
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
                  { variable: "release", frontmatterKey: "journal-release", anchorValue: 1, reset: { kind: "never" } },
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
      const fm = resolve(FrontmatterService);
      const result = fm.parseEntry("S/1.md" as VaultPath, {
        journal: "s",
        "journal-date": "2024-01-01",
        "journal-sprint": 3,
      });
      expect(result.isSome() && result.value.numbers).toEqual({ sprint: 3 });
    });

    describe("fixed monthly journal", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: { journals: { m: fixedJournal("m", { type: "month" }) } },
        });
      });

      it("rejects a fixed monthly note whose date is not the month anchor", () => {
        const fm = harness.resolve(FrontmatterService);
        const result = fm.parseEntry("M/june.md" as VaultPath, { journal: "m", "journal-date": "2024-06-15" });
        expect(result.isNone()).toBe(true);
      });

      it("accepts a fixed monthly note whose date is the month anchor", () => {
        const fm = harness.resolve(FrontmatterService);
        const result = fm.parseEntry("M/june.md" as VaultPath, { journal: "m", "journal-date": "2024-06-01" });
        expect(result.isSome()).toBe(true);
      });
    });

    it("re-adopts a note written through writeMutator for its own fixed journal", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { weekly: fixedJournal("weekly", { type: "week" }) } },
      });
      const fm = resolve(FrontmatterService);
      const written = fm.writeMutator("weekly", { journalName: "weekly", anchor: "2021-01-04" as AnchorString });
      expect(written.isOk()).toBe(true);
      if (!written.isOk()) return;
      const out: Record<string, unknown> = {};
      written.value(out);
      expect(fm.parseEntry("W/x.md" as VaultPath, out).isSome()).toBe(true);
    });
  });

  describe("buildMetadata", () => {
    it("returns Err(JournalNotFoundError) for unknown journal", async () => {
      const { resolve } = await testContainer({ modules: [journalsCoreModule], data: { journals: {} } });
      const fm = resolve(FrontmatterService);
      const result = fm.buildMetadata("missing", "2024-01-01" as AnchorString);
      expect(result.isErr() && result.error.constructor.name).toBe("JournalNotFoundError");
    });

    describe("custom weekly journal", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: { journals: { s: customJournal("s", "week", 1, "2024-01-01") } },
        });
      });

      it("returns metadata with numbers for an enabled custom journal", () => {
        const fm = harness.resolve(FrontmatterService);
        const result = fm.buildMetadata("s", "2024-01-08" as AnchorString);
        expect(result.isOk() && result.value).toEqual({
          journalName: "s",
          anchor: "2024-01-08",
          numbers: { index: 2 },
        });
      });

      it("includes endDate when the stored entry has one", () => {
        harness.resolve(JournalsIndex).register({
          journalName: "s",
          anchor: "2024-01-01" as AnchorString,
          path: "S/1.md" as VaultPath,
          endDate: "2024-01-14" as AnchorString,
        });
        const fm = harness.resolve(FrontmatterService);
        const result = fm.buildMetadata("s", "2024-01-01" as AnchorString);
        expect(result.isOk() && result.value.endDate).toBe("2024-01-14");
      });

      it("omits endDate when no stored extension exists", () => {
        const fm = harness.resolve(FrontmatterService);
        const result = fm.buildMetadata("s", "2024-01-01" as AnchorString);
        expect(result.isOk() && result.value.endDate).toBeUndefined();
      });
    });
  });

  describe("clearMutator", () => {
    it("deletes only journal-owned frontmatter keys", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { weekly: customJournal("weekly", "week", 1, "2024-01-01") } },
      });
      const fm = resolve(FrontmatterService);
      const mutator = fm.clearMutator("weekly");
      expect(mutator.isOk()).toBe(true);
      const frontmatter: Record<string, unknown> = {
        journal: "weekly",
        "journal-date": "2026-06-01",
        "journal-start-date": "2026-06-01",
        "journal-end-date": "2026-06-01",
        "journal-index": 12,
        title: "keep me",
      };
      if (!mutator.isOk()) return;
      mutator.value(frontmatter);
      expect(frontmatter).toEqual({ title: "keep me" });
    });

    it("returns an error for an unknown journal", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      const fm = resolve(FrontmatterService);
      expect(fm.clearMutator("nope").isErr()).toBe(true);
    });
  });

  describe("writeMutator", () => {
    it("writes journal name and date field", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      const fm = resolve(FrontmatterService);
      const result = fm.writeMutator("daily", {
        journalName: "daily",
        anchor: "2024-01-01" as AnchorString,
      });
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) return;
      const out: Record<string, unknown> = {};
      result.value(out);
      expect(out.journal).toBe("daily");
      expect(out["journal-date"]).toBe("2024-01-01");
    });

    it("writes startDate when addStartDate is true", async () => {
      const daily: JournalConfig = fixedJournal(
        "daily",
        { type: "day" },
        {
          frontmatter: {
            dateField: "journal-date",
            startDateField: "journal-start-date",
            endDateField: "journal-end-date",
            addStartDate: true,
            addEndDate: false,
          },
        },
      );
      const { resolve } = await testContainer({ modules: [journalsCoreModule], data: { journals: { daily } } });
      const fm = resolve(FrontmatterService);
      const result = fm.writeMutator("daily", {
        journalName: "daily",
        anchor: "2024-01-01" as AnchorString,
      });
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) return;
      const out: Record<string, unknown> = {};
      result.value(out);
      expect(out["journal-start-date"]).toBe("2024-01-01");
    });

    describe("custom weekly journal", () => {
      let harness: TestHarness;

      beforeEach(async () => {
        harness = await testContainer({
          modules: [journalsCoreModule],
          data: { journals: { s: customJournal("s", "week", 1, "2024-01-01") } },
        });
      });

      it("writes endDate when an extension is present even if addEndDate is false", () => {
        const fm = harness.resolve(FrontmatterService);
        const result = fm.writeMutator("s", {
          journalName: "s",
          anchor: "2024-01-01" as AnchorString,
          endDate: "2024-01-14" as AnchorString,
        });
        expect(result.isOk()).toBe(true);
        if (!result.isOk()) return;
        const out: Record<string, unknown> = {};
        result.value(out);
        expect(out["journal-end-date"]).toBe("2024-01-14");
      });

      it("suppresses an endDate equal to the default period end when addEndDate is false", () => {
        // 2024-01-07 is the auto-derived end of the one-week interval at 2024-01-01 — redundant
        // period metadata, not a manual extension, so it is not persisted.
        const fm = harness.resolve(FrontmatterService);
        const result = fm.writeMutator("s", {
          journalName: "s",
          anchor: "2024-01-01" as AnchorString,
          endDate: "2024-01-07" as AnchorString,
        });
        expect(result.isOk()).toBe(true);
        if (!result.isOk()) return;
        const out: Record<string, unknown> = { "journal-end-date": "2024-01-07" };
        result.value(out);
        expect("journal-end-date" in out).toBe(false);
      });

      it("writes each numbering frontmatterKey when value present, deletes when absent", () => {
        const fm = harness.resolve(FrontmatterService);

        const withNumbers = fm.writeMutator("s", {
          journalName: "s",
          anchor: "2024-01-01" as AnchorString,
          numbers: { index: 42 },
        });
        expect(withNumbers.isOk()).toBe(true);
        if (!withNumbers.isOk()) return;
        const out1: Record<string, unknown> = { "journal-index": 99 };
        withNumbers.value(out1);
        expect(out1["journal-index"]).toBe(42);

        const withoutNumbers = fm.writeMutator("s", {
          journalName: "s",
          anchor: "2024-01-01" as AnchorString,
        });
        expect(withoutNumbers.isOk()).toBe(true);
        if (!withoutNumbers.isOk()) return;
        const out2: Record<string, unknown> = { "journal-index": 99 };
        withoutNumbers.value(out2);
        expect("journal-index" in out2).toBe(false);
      });
    });

    it("writes an endDate equal to the default period end when addEndDate is true", async () => {
      const { resolve } = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            s: customJournal("s", "week", 1, "2024-01-01", {
              frontmatter: {
                dateField: "journal-date",
                startDateField: "journal-start-date",
                endDateField: "journal-end-date",
                addStartDate: false,
                addEndDate: true,
              },
            }),
          },
        },
      });
      const fm = resolve(FrontmatterService);
      const result = fm.writeMutator("s", {
        journalName: "s",
        anchor: "2024-01-01" as AnchorString,
        endDate: "2024-01-07" as AnchorString,
      });
      expect(result.isOk()).toBe(true);
      if (!result.isOk()) return;
      const out: Record<string, unknown> = {};
      result.value(out);
      expect(out["journal-end-date"]).toBe("2024-01-07");
    });
  });
});
