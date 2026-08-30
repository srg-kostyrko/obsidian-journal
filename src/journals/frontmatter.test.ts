import { assert, beforeEach, describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { anchor } from "@/calendar/testing";
import type { VaultPath } from "@/infrastructure/host";
import { testContainer, type TestHarness } from "@/testing";

import { NoteletTypeNotFoundError } from "./errors";
import { FrontmatterService } from "./frontmatter";
import { JournalsIndex } from "./journals-index";
import { journalsCoreModule } from "./module";
import { buildNoteletType, customJournal, fixedJournal, unwrap } from "./testing";
import { isNotelet } from "./types";

import type { JournalConfig } from "./config";

const dailyWithStandupNotelet = () =>
  fixedJournal(
    "daily",
    { type: "day" },
    { notelets: { nt_1: buildNoteletType({ id: "nt_1" as never, name: "Standup" }) } },
  );

const dailyWithStandupType = () =>
  fixedJournal(
    "daily",
    { type: "day" },
    {
      frontmatter: {
        dateField: "journal-date",
        startDateField: "journal-start-date",
        endDateField: "journal-end-date",
        noteletField: "journal-notelet",
        addStartDate: true,
        addEndDate: true,
      },
      numbering: {
        enabled: true,
        anchorDate: anchor("2026-01-01"),
        allowBefore: false,
        sources: [{ variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } }],
      },
      prompts: [{ type: "text", variable: "mood", question: "Mood?", frontmatterKey: "mood", required: false }],
      notelets: {
        nt_1: buildNoteletType({
          id: "nt_1" as never,
          name: "Standup",
          counter: { enabled: true, frontmatterKey: "standup-no" },
          prompts: [{ type: "text", variable: "who", question: "Who?", frontmatterKey: "with", required: false }],
        }),
      },
    },
  );

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
                noteletField: "journal-notelet",
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
      const entry = unwrap(result);
      assert(!isNotelet(entry));
      expect(entry.endDate).toBe("2024-01-14");
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
        const entry = unwrap(result);
        assert(!isNotelet(entry));
        expect(entry.endDate).toBeUndefined();
      });

      it("includes the numbers dictionary keyed by source variable", () => {
        const fm = harness.resolve(FrontmatterService);
        const result = fm.parseEntry("S/1.md" as VaultPath, {
          journal: "s",
          "journal-date": "2024-01-01",
          "journal-index": 5,
        });
        const entry = unwrap(result);
        assert(!isNotelet(entry));
        expect(entry.numbers).toEqual({ index: 5 });
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
      const entry = unwrap(result);
      assert(!isNotelet(entry));
      expect(entry.numbers).toEqual({ sprint: 3 });
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

  describe("parseEntry on a notelet", () => {
    it("parses a note carrying the type key as a notelet", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: dailyWithStandupNotelet() } },
      });

      const parsed = harness.resolve(FrontmatterService).parseEntry("a.md" as VaultPath, {
        journal: "daily",
        "journal-date": "2026-01-01",
        "journal-notelet": "Standup",
      });

      const entry = unwrap(parsed);
      assert(isNotelet(entry));
      expect(entry.typeName).toBe("Standup");
      expect(entry.typeId).toBe("nt_1");
    });

    it("parses an unresolvable type name as an orphaned notelet", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: dailyWithStandupNotelet() } },
      });

      const entry = unwrap(
        harness.resolve(FrontmatterService).parseEntry("a.md" as VaultPath, {
          journal: "daily",
          "journal-date": "2026-01-01",
          "journal-notelet": "Gone",
        }),
      );

      assert(isNotelet(entry));
      expect(entry.typeName).toBe("Gone");
      expect(entry.typeId).toBeNull();
    });

    it("parses an empty type key as an orphaned notelet, not a period note", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: dailyWithStandupNotelet() } },
      });

      const entry = unwrap(
        harness
          .resolve(FrontmatterService)
          .parseEntry("a.md" as VaultPath, { journal: "daily", "journal-date": "2026-01-01", "journal-notelet": "" }),
      );

      expect(isNotelet(entry)).toBe(true);
    });

    it("parses a non-string type key as an orphaned notelet", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: dailyWithStandupNotelet() } },
      });

      const entry = unwrap(
        harness
          .resolve(FrontmatterService)
          .parseEntry("a.md" as VaultPath, { journal: "daily", "journal-date": "2026-01-01", "journal-notelet": 7 }),
      );

      assert(isNotelet(entry));
      expect(entry.typeId).toBeNull();
    });

    it("does not resolve a non-string type key even when its stringified value names a real type", async () => {
      const config = fixedJournal(
        "daily",
        { type: "day" },
        { notelets: { nt_1: buildNoteletType({ id: "nt_1" as never, name: "7" }) } },
      );
      const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: { daily: config } } });

      const entry = unwrap(
        harness
          .resolve(FrontmatterService)
          .parseEntry("a.md" as VaultPath, { journal: "daily", "journal-date": "2026-01-01", "journal-notelet": 7 }),
      );

      assert(isNotelet(entry));
      expect(entry.typeName).toBe("7");
      expect(entry.typeId).toBeNull();
    });

    it("treats a null type key as absent", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: dailyWithStandupNotelet() } },
      });

      const entry = unwrap(
        harness
          .resolve(FrontmatterService)
          .parseEntry("a.md" as VaultPath, { journal: "daily", "journal-date": "2026-01-01", "journal-notelet": null }),
      );

      expect(isNotelet(entry)).toBe(false);
    });

    it("reads the type's counter and prompt answers", async () => {
      const config = fixedJournal(
        "daily",
        { type: "day" },
        {
          notelets: {
            nt_1: buildNoteletType({
              id: "nt_1" as never,
              name: "Standup",
              counter: { enabled: true, frontmatterKey: "standup-no" },
              prompts: [
                {
                  type: "text",
                  variable: "who",
                  question: "Who?",
                  frontmatterKey: "with",
                  required: false,
                },
              ],
            }),
          },
        },
      );
      const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: { daily: config } } });

      const entry = unwrap(
        harness.resolve(FrontmatterService).parseEntry("a.md" as VaultPath, {
          journal: "daily",
          "journal-date": "2026-01-01",
          "journal-notelet": "Standup",
          "standup-no": 3,
          with: "Alice",
        }),
      );

      assert(isNotelet(entry));
      expect(entry.counter).toBe(3);
      expect(entry.answers).toEqual({ who: "Alice" });
    });

    it("rejects a notelet whose stored date is not the period's canonical anchor", async () => {
      const config = fixedJournal(
        "weekly",
        { type: "week" },
        { notelets: { nt_1: buildNoteletType({ id: "nt_1" as never, name: "Standup" }) } },
      );
      const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: { weekly: config } } });

      const parsed = harness.resolve(FrontmatterService).parseEntry("a.md" as VaultPath, {
        journal: "weekly",
        "journal-date": "2026-01-07",
        "journal-notelet": "Standup",
      });

      expect(parsed.isNone()).toBe(true);
    });

    it("honors a renamed type key", async () => {
      const base = fixedJournal(
        "daily",
        { type: "day" },
        { notelets: { nt_1: buildNoteletType({ id: "nt_1" as never, name: "Standup" }) } },
      );
      const config = { ...base, frontmatter: { ...base.frontmatter, noteletField: "kind" } };
      const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: { daily: config } } });

      const entry = unwrap(
        harness
          .resolve(FrontmatterService)
          .parseEntry("a.md" as VaultPath, { journal: "daily", "journal-date": "2026-01-01", kind: "Standup" }),
      );

      expect(isNotelet(entry)).toBe(true);
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
            noteletField: "journal-notelet",
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
                noteletField: "journal-notelet",
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

  describe("prompt answers", () => {
    let harness: TestHarness;

    const prompted = fixedJournal(
      "daily",
      { type: "day" },
      {
        prompts: [
          { variable: "mood", question: "How?", type: "text", frontmatterKey: "mood", required: false },
          { variable: "note", question: "Why?", type: "text", frontmatterKey: "", required: false },
        ],
      },
    );

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: prompted } },
      });
    });

    it("reads a stored answer off its frontmatter key", () => {
      const fm = harness.resolve(FrontmatterService);
      const entry = fm.parseEntry("D/2024-01-01.md" as VaultPath, {
        journal: "daily",
        "journal-date": "2024-01-01",
        mood: "great",
      });
      expect(entry.isSome() && entry.value.answers).toEqual({ mood: "great" });
    });

    it("omits answers entirely when no prompt key is present", () => {
      const fm = harness.resolve(FrontmatterService);
      const entry = fm.parseEntry("D/2024-01-01.md" as VaultPath, { journal: "daily", "journal-date": "2024-01-01" });
      expect(entry.isSome() && "answers" in entry.value).toBe(false);
    });

    it("writes an answer to its frontmatter key", () => {
      const fm = harness.resolve(FrontmatterService);
      const mutator = fm.writeMutator("daily", {
        journalName: "daily",
        anchor: "2024-01-01" as AnchorString,
        answers: { mood: "great" },
      });
      const target: Record<string, unknown> = {};
      expect(mutator.isOk()).toBe(true);
      if (mutator.isOk()) mutator.value(target);
      expect(target.mood).toBe("great");
    });

    it("leaves an existing answer alone when metadata carries none", () => {
      const fm = harness.resolve(FrontmatterService);
      const mutator = fm.writeMutator("daily", { journalName: "daily", anchor: "2024-01-01" as AnchorString });
      const target: Record<string, unknown> = { mood: "hand-edited" };
      if (mutator.isOk()) mutator.value(target);
      expect(target.mood).toBe("hand-edited");
    });

    it("writes nothing for a prompt with no frontmatter key", () => {
      const fm = harness.resolve(FrontmatterService);
      const mutator = fm.writeMutator("daily", {
        journalName: "daily",
        anchor: "2024-01-01" as AnchorString,
        answers: { note: "body only" },
      });
      const target: Record<string, unknown> = {};
      if (mutator.isOk()) mutator.value(target);
      expect(Object.values(target)).not.toContain("body only");
    });

    it("clears every prompt key on disconnect", () => {
      const fm = harness.resolve(FrontmatterService);
      const mutator = fm.clearMutator("daily");
      const target: Record<string, unknown> = { journal: "daily", mood: "great" };
      if (mutator.isOk()) mutator.value(target);
      expect(target.mood).toBeUndefined();
    });

    it("lifts a stored answer into metadata built for that anchor", () => {
      const index = harness.resolve(JournalsIndex);
      index.register({
        journalName: "daily",
        anchor: "2024-01-01" as AnchorString,
        path: "D/2024-01-01.md" as VaultPath,
        answers: { mood: "great" },
      });
      const fm = harness.resolve(FrontmatterService);
      const built = fm.buildMetadata("daily", "2024-01-01" as AnchorString);
      expect(built.isOk() && built.value.answers).toEqual({ mood: "great" });
    });
  });

  describe("notelet mutators", () => {
    it("writes only the journal claim, the anchor, the type name, the counter and the answers", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: dailyWithStandupType() } },
      });
      const mutator = harness.resolve(FrontmatterService).writeMutator("daily", {
        kind: "notelet",
        journalName: "daily",
        anchor: anchor("2026-01-01"),
        typeId: "nt_1" as never,
        counter: 2,
        answers: { who: "Alice" },
      });
      const fm: Record<string, unknown> = {};

      assert(mutator.isOk());
      mutator.value(fm);

      expect(fm).toEqual({
        journal: "daily",
        "journal-date": "2026-01-01",
        "journal-notelet": "Standup",
        "standup-no": 2,
        with: "Alice",
      });
    });

    it("refuses to write a notelet whose type no longer exists", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: dailyWithStandupType() } },
      });

      const mutator = harness.resolve(FrontmatterService).writeMutator("daily", {
        kind: "notelet",
        journalName: "daily",
        anchor: anchor("2026-01-01"),
        typeId: "nt_gone" as never,
      });

      expect(mutator.isErr() && mutator.error).toBeInstanceOf(NoteletTypeNotFoundError);
    });

    it("deletes existing start and end date keys since a notelet never carries either", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: dailyWithStandupType() } },
      });
      const mutator = harness.resolve(FrontmatterService).writeMutator("daily", {
        kind: "notelet",
        journalName: "daily",
        anchor: anchor("2026-01-01"),
        typeId: "nt_1" as never,
      });
      const fm: Record<string, unknown> = {
        "journal-start-date": "2025-12-29",
        "journal-end-date": "2026-01-04",
      };

      assert(mutator.isOk());
      mutator.value(fm);

      expect(fm).toEqual({
        journal: "daily",
        "journal-date": "2026-01-01",
        "journal-notelet": "Standup",
      });
    });

    it("clearMutator strips the type key and every type's counter and prompt keys", async () => {
      const base = dailyWithStandupType();
      const config: JournalConfig = {
        ...base,
        notelets: {
          ...base.notelets,
          nt_2: buildNoteletType({
            id: "nt_2" as never,
            name: "Retro",
            counter: { enabled: true, frontmatterKey: "retro-no" },
            prompts: [
              { type: "text", variable: "notes", question: "Notes?", frontmatterKey: "retro-notes", required: false },
            ],
          }),
        },
      };
      const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: { daily: config } } });
      const mutator = harness.resolve(FrontmatterService).clearMutator("daily");
      const fm: Record<string, unknown> = {
        journal: "daily",
        "journal-date": "2026-01-01",
        "journal-notelet": "Standup",
        "standup-no": 2,
        with: "Alice",
        "retro-no": 5,
        "retro-notes": "went well",
        keep: "me",
      };

      assert(mutator.isOk());
      mutator.value(fm);

      expect(fm).toEqual({ keep: "me" });
    });
  });

  describe("notelet typeId round-trip", () => {
    it("writes a notelet then parses it back to the same typeId and typeName, and that typeId writes again", async () => {
      // The record key ("nt_1") disagrees with the stored id field ("nt_9") on purpose: typeId
      // must come from the record key, not the id field, or this round trip fails.
      const config = fixedJournal(
        "daily",
        { type: "day" },
        { notelets: { nt_1: buildNoteletType({ id: "nt_9" as never, name: "Standup" }) } },
      );
      const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: { daily: config } } });
      const service = harness.resolve(FrontmatterService);

      const mutator = service.writeMutator("daily", {
        kind: "notelet",
        journalName: "daily",
        anchor: anchor("2026-01-01"),
        typeId: "nt_1" as never,
      });
      assert(mutator.isOk());
      const fm: Record<string, unknown> = {};
      mutator.value(fm);

      const parsed = service.parseEntry("a.md" as VaultPath, fm);
      assert(parsed.isSome());
      const entry = parsed.value;
      assert(isNotelet(entry));
      expect(entry.typeId).toBe("nt_1");
      expect(entry.typeName).toBe("Standup");

      assert(entry.typeId !== null);
      const rewritten = service.writeMutator("daily", {
        kind: "notelet",
        journalName: "daily",
        anchor: entry.anchor,
        typeId: entry.typeId,
      });
      expect(rewritten.isOk()).toBe(true);
    });
  });
});
