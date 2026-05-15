import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { SettingsService } from "@/settings";

import { CycleService } from "./cycle";
import { FrontmatterService } from "./frontmatter";
import { JournalsIndex } from "./journals-index";
import { NumberingService } from "./numbering";
import { customJournal, fakeSettings, fixedJournal } from "./testing";

function buildContainer(journals: Parameters<typeof fakeSettings>[0]): Container {
  const c = new Container();
  c.register(SettingsService).useValue(fakeSettings(journals));
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
});
