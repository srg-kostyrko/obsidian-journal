import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";

import { CycleService } from "./cycle";
import { FrontmatterService } from "./frontmatter";
import { JournalsIndex } from "./journals-index";
import { NumberingService } from "./numbering";
import { JournalsRepository } from "./repository";
import { customJournal, fakeRepo, fixedJournal } from "./testing";

function buildContainer(journals: Parameters<typeof fakeRepo>[0]): Container {
  const c = new Container();
  c.register(JournalsRepository).useValue(fakeRepo(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  return c;
}

describe("FrontmatterService", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("parseEntry", () => {
    it("returns Some(entry) for valid frontmatter with a known journal", () => {
      const c = buildContainer({ daily: fixedJournal("daily", { type: "day" }) });
      const fm = c.resolve(FrontmatterService);
      const result = fm.parseEntry("D/2024-01-01.md" as VaultPath, { journal: "daily", "journal-date": "2024-01-01" });
      expect(result.isSome() && result.value).toEqual({
        journalName: "daily",
        anchor: "2024-01-01",
        path: "D/2024-01-01.md",
      });
    });

    it("returns None when the journal key is missing", () => {
      const c = buildContainer({ daily: fixedJournal("daily", { type: "day" }) });
      const fm = c.resolve(FrontmatterService);
      expect(fm.parseEntry("X.md" as VaultPath, { "journal-date": "2024-01-01" }).isNone()).toBe(true);
    });

    it("returns None when the journal is unknown", () => {
      const c = buildContainer({});
      const fm = c.resolve(FrontmatterService);
      expect(fm.parseEntry("X.md" as VaultPath, { journal: "missing", "journal-date": "2024-01-01" }).isNone()).toBe(
        true,
      );
    });

    it("returns None when the date field is invalid", () => {
      const c = buildContainer({ daily: fixedJournal("daily", { type: "day" }) });
      const fm = c.resolve(FrontmatterService);
      expect(fm.parseEntry("X.md" as VaultPath, { journal: "daily", "journal-date": "not-a-date" }).isNone()).toBe(
        true,
      );
    });

    it("includes endDate when present and valid", () => {
      const c = buildContainer({
        s: customJournal("s", "week", 1, "2024-01-01", {
          frontmatter: {
            dateField: "journal-date",
            startDateField: "journal-start-date",
            endDateField: "journal-end-date",
            addStartDate: false,
            addEndDate: true,
          },
        }),
      });
      const fm = c.resolve(FrontmatterService);
      const result = fm.parseEntry("S/1.md" as VaultPath, {
        journal: "s",
        "journal-date": "2024-01-01",
        "journal-end-date": "2024-01-14",
      });
      expect(result.isSome() && result.value.endDate).toBe("2024-01-14");
    });

    it("ignores invalid endDate but keeps the entry", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const fm = c.resolve(FrontmatterService);
      const result = fm.parseEntry("S/1.md" as VaultPath, {
        journal: "s",
        "journal-date": "2024-01-01",
        "journal-end-date": "not-a-date",
      });
      expect(result.isSome() && result.value.endDate).toBeUndefined();
    });

    it("includes the numbers dictionary keyed by source variable", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const fm = c.resolve(FrontmatterService);
      const result = fm.parseEntry("S/1.md" as VaultPath, {
        journal: "s",
        "journal-date": "2024-01-01",
        "journal-index": 5,
      });
      expect(result.isSome() && result.value.numbers).toEqual({ index: 5 });
    });

    it("includes only the present number fields for multi-source numbering", () => {
      const c = buildContainer({
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
      });
      const fm = c.resolve(FrontmatterService);
      const result = fm.parseEntry("S/1.md" as VaultPath, {
        journal: "s",
        "journal-date": "2024-01-01",
        "journal-sprint": 3,
      });
      expect(result.isSome() && result.value.numbers).toEqual({ sprint: 3 });
    });
  });

  describe("buildMetadata", () => {
    it("returns Err(JournalNotFoundError) for unknown journal", () => {
      const c = buildContainer({});
      const fm = c.resolve(FrontmatterService);
      const result = fm.buildMetadata("missing", "2024-01-01" as AnchorString);
      expect(result.isErr() && result.error.constructor.name).toBe("JournalNotFoundError");
    });

    it("returns metadata with numbers for an enabled custom journal", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const fm = c.resolve(FrontmatterService);
      const result = fm.buildMetadata("s", "2024-01-08" as AnchorString);
      expect(result.isOk() && result.value).toEqual({
        journalName: "s",
        anchor: "2024-01-08",
        numbers: { index: 2 },
      });
    });

    it("includes endDate when the stored entry has one", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const index = c.resolve(JournalsIndex);
      index.register({
        journalName: "s",
        anchor: "2024-01-01" as AnchorString,
        path: "S/1.md" as VaultPath,
        endDate: "2024-01-14" as AnchorString,
      });
      const fm = c.resolve(FrontmatterService);
      const result = fm.buildMetadata("s", "2024-01-01" as AnchorString);
      expect(result.isOk() && result.value.endDate).toBe("2024-01-14");
    });

    it("omits endDate when no stored extension exists", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const fm = c.resolve(FrontmatterService);
      const result = fm.buildMetadata("s", "2024-01-01" as AnchorString);
      expect(result.isOk() && result.value.endDate).toBeUndefined();
    });
  });

  describe("writeMutator", () => {
    it("writes journal name and date field", () => {
      const c = buildContainer({ daily: fixedJournal("daily", { type: "day" }) });
      const fm = c.resolve(FrontmatterService);
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

    it("writes startDate when addStartDate is true", () => {
      const c = buildContainer({
        daily: fixedJournal(
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
        ),
      });
      const fm = c.resolve(FrontmatterService);
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

    it("writes endDate when an extension is present even if addEndDate is false", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const fm = c.resolve(FrontmatterService);
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

    it("writes each numbering frontmatterKey when value present, deletes when absent", () => {
      const c = buildContainer({ s: customJournal("s", "week", 1, "2024-01-01") });
      const fm = c.resolve(FrontmatterService);

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
});
