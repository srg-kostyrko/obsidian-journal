import { describe, it, expect, vi, beforeEach, afterEach, assert } from "vitest";

import { CalendarDate, type AnchorString } from "@/calendar";
import { anchor } from "@/calendar/testing";
import type { VaultPath } from "@/infrastructure/host";
import { TemplateEngine, type TemplateContext } from "@/templates";
import { testContainer, type TestHarness } from "@/testing";

import { CycleService } from "../cycle";
import { JournalNotFoundError, OutOfTimelineError } from "../errors";
import { JournalsIndex } from "../journals-index";
import { journalsCoreModule } from "../module";
import { customJournal, fixedJournal, unwrap } from "../testing";

import { EmptyNoteNameError } from "./errors";
import { NotePathService } from "./note-path";

import type { JournalConfig } from "../config";
import type { JournalMetadata } from "../types";

describe("NotePathService.pathFor", () => {
  it("renders nameTemplate with .md suffix when folder is empty", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };

    const result = harness.resolve(NotePathService).pathFor("daily", meta);

    expect(result.isOk() && result.value).toBe("2026-05-19.md");
  });

  it("renders a capitalized date variable rather than emitting it raw", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: { daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "{{Date:YYYY-MM-DD}}" }) },
      },
    });

    const result = harness.resolve(NotePathService).pathForDate("daily", CalendarDate.fromAnchor(anchor("2026-05-19")));

    expect(result.isOk() && result.value).toBe("2026-05-19.md");
  });

  it("prefixes folder when configured", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { folder: "Diary/{{date:YYYY}}" }) } },
    });
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };

    const result = harness.resolve(NotePathService).pathFor("daily", meta);

    expect(result.isOk() && result.value).toBe("Diary/2026/2026-05-19.md");
  });

  it("resolves {{note_name}} in the folder template to the rendered note name", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { folder: "Journal/{{note_name}}" }) } },
    });
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };

    const result = harness.resolve(NotePathService).pathFor("daily", meta);

    expect(result.isOk() && result.value).toBe("Journal/2026-05-19/2026-05-19.md");
  });

  it("treats {{title}} as an alias for the note name in the folder template", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { folder: "Journal/{{title}}" }) } },
    });
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };

    const result = harness.resolve(NotePathService).pathFor("daily", meta);

    expect(result.isOk() && result.value).toBe("Journal/2026-05-19/2026-05-19.md");
  });

  it("returns JournalNotFoundError for an unknown journal", async () => {
    const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: {} } });
    const meta: JournalMetadata = { journalName: "missing", anchor: anchor("2026-05-19") };

    const result = harness.resolve(NotePathService).pathFor("missing", meta);

    expect(result.isErr() && result.error instanceof JournalNotFoundError).toBe(true);
  });

  it("returns EmptyNoteNameError when the name template is blank", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "" }) } },
    });
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };

    const result = harness.resolve(NotePathService).pathFor("daily", meta);

    expect(result.isErr() && result.error instanceof EmptyNoteNameError).toBe(true);
  });

  it("returns EmptyNoteNameError when the name template is only whitespace", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { nameTemplate: " ".repeat(3) }) } },
    });
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };

    const result = harness.resolve(NotePathService).pathFor("daily", meta);

    expect(result.isErr() && result.error instanceof EmptyNoteNameError).toBe(true);
  });

  it("returns EmptyNoteNameError when every variable in the name template renders empty", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            {
              nameTemplate: "{{index}}",
              numbering: {
                enabled: false,
                anchorDate: anchor("2026-01-01"),
                allowBefore: false,
                sources: [{ variable: "index", frontmatterKey: "index", anchorValue: 1, reset: { kind: "never" } }],
              },
            },
          ),
        },
      },
    });
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };

    const result = harness.resolve(NotePathService).pathFor("daily", meta);

    expect(result.isErr() && result.error instanceof EmptyNoteNameError).toBe(true);
  });

  it("resolves the path when only the folder template renders empty", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { folder: "" }) } },
    });
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };

    const result = harness.resolve(NotePathService).pathFor("daily", meta);

    expect(result.isOk() && result.value).toBe("2026-05-19.md");
  });

  it("renders an empty string for a numbering variable with no resolved value", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          sprints: customJournal("sprints", "week", 1, "2024-01-01", { nameTemplate: "{{journal_name}} {{index}}" }),
        },
      },
    });
    const meta: JournalMetadata = { journalName: "sprints", anchor: anchor("2024-01-01") };

    const result = harness.resolve(NotePathService).pathFor("sprints", meta);

    expect(result.isOk() && result.value).toBe("sprints .md");
  });
});

describe("NotePathService.pathForDate", () => {
  it("resolves the note path for a date in a fixed day journal", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });

    const result = harness.resolve(NotePathService).pathForDate("daily", CalendarDate.fromAnchor(anchor("2026-05-19")));

    expect(result.isOk() && result.value).toBe("2026-05-19.md");
  });

  it("resolves the enclosing week note when the journal writes weeks", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { weekly: fixedJournal("weekly", { type: "week" }) } },
    });

    const result = harness
      .resolve(NotePathService)
      .pathForDate("weekly", CalendarDate.fromAnchor(anchor("2026-05-19")));

    expect(result.isOk() && result.value).toMatch(/^\d{4}-W\d{1,2}\.md$/);
  });

  it("returns JournalNotFoundError for an unknown journal", async () => {
    const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: {} } });

    const result = harness
      .resolve(NotePathService)
      .pathForDate("missing", CalendarDate.fromAnchor(anchor("2026-05-19")));

    expect(result.isErr() && result.error instanceof JournalNotFoundError).toBe(true);
  });
});

describe("NotePathService.noteNameFor", () => {
  it("renders the name template without the folder or the .md extension", async () => {
    const config = fixedJournal("daily", { type: "day" }, { folder: "Journals/{{date:YYYY}}" });
    const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: { daily: config } } });
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };

    expect(harness.resolve(NotePathService).noteNameFor(config, meta)).toBe("2026-05-19");
  });

  it("renders a numbering variable from the metadata's stored numbers", async () => {
    const config = customJournal("sprint", "week", 2, "2024-01-01", { nameTemplate: "Sprint {{index}}" });
    const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: { sprint: config } } });
    const meta: JournalMetadata = { journalName: "sprint", anchor: anchor("2024-01-15"), numbers: { index: 2 } };

    expect(harness.resolve(NotePathService).noteNameFor(config, meta)).toBe("Sprint 2");
  });
});

function sprintJournal(anchorDate: string): JournalConfig {
  return customJournal("sprints", "week", 2, anchorDate, {
    nameTemplate: "{{date:YYYY}}-C{{cycle}}-S{{sprint}}",
    numbering: {
      enabled: true,
      anchorDate: anchorDate as AnchorString,
      allowBefore: false,
      sources: [
        { variable: "cycle", frontmatterKey: "journal-cycle", anchorValue: 1, reset: { kind: "never" } },
        { variable: "sprint", frontmatterKey: "journal-sprint", anchorValue: 1, reset: { kind: "after", count: 3 } },
      ],
    },
  });
}

describe("NotePathService.candidateFor", () => {
  describe("a plain daily journal", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
    });

    it("inverts a {{date}}.md path into a metadata anchor", () => {
      const result = harness.resolve(NotePathService).candidateFor("daily", "2026-05-19.md" as VaultPath);

      const metadata = unwrap(result);
      expect(metadata.anchor).toBe("2026-05-19");
      expect(metadata.journalName).toBe("daily");
    });

    it("returns None when the path doesn't match the template", () => {
      const result = harness.resolve(NotePathService).candidateFor("daily", "Inbox/note.md" as VaultPath);

      expect(result.isNone()).toBe(true);
    });
  });

  it("inverts a path whose template capitalized the date variable", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: { daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "{{Date:YYYY-MM-DD}}" }) },
      },
    });

    const result = harness.resolve(NotePathService).candidateFor("daily", "2026-05-19.md" as VaultPath);

    expect(unwrap(result).anchor).toBe("2026-05-19");
  });

  it("inverts folder + name combined", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { folder: "Diary/{{date:YYYY}}" }) } },
    });

    const result = harness.resolve(NotePathService).candidateFor("daily", "Diary/2026/2026-05-19.md" as VaultPath);

    expect(unwrap(result).anchor).toBe("2026-05-19");
  });

  it("inverts a date split across folder segments and the filename", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            { folder: "Journals/{{date:YYYY}}/{{date:MM}}", nameTemplate: "{{date:DD}}" },
          ),
        },
      },
    });

    const result = harness.resolve(NotePathService).candidateFor("daily", "Journals/2026/05/19.md" as VaultPath);

    expect(unwrap(result).anchor).toBe("2026-05-19");
  });

  it("inverts a date split across multiple tokens in the filename", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "{{date:YYYY}}-{{date:MM}}-{{date:DD}}" }),
        },
      },
    });

    const result = harness.resolve(NotePathService).candidateFor("daily", "2026-05-19.md" as VaultPath);

    expect(unwrap(result).anchor).toBe("2026-05-19");
  });

  describe("a quarter split between a year folder and the filename", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            quarterly: fixedJournal(
              "quarterly",
              { type: "quarter" },
              { folder: "Quarters/{{date:YYYY}}", nameTemplate: "{{date:[Q]Q}}" },
            ),
          },
        },
      });
    });

    it("inverts a quarter split between a year folder and the filename", () => {
      const service = harness.resolve(NotePathService);

      expect(unwrap(service.candidateFor("quarterly", "Quarters/2027/Q3.md" as VaultPath)).anchor).toBe("2027-07-01");
      expect(unwrap(service.candidateFor("quarterly", "Quarters/2025/Q1.md" as VaultPath)).anchor).toBe("2025-01-01");
    });

    it("round-trips every quarter of a split template, including across years", () => {
      const service = harness.resolve(NotePathService);

      for (const a of ["2025-01-01", "2025-04-01", "2025-07-01", "2025-10-01", "2027-10-01"]) {
        const path = service.pathFor("quarterly", { journalName: "quarterly", anchor: anchor(a) });
        assert(path.isOk());
        expect(unwrap(service.candidateFor("quarterly", path.value)).anchor).toBe(a);
      }
    });
  });

  // A week's tokens render from its representative day, so the year written into the folder is the
  // week-year -- a week starting in the previous calendar year has to invert back to its own start.
  it("round-trips a week split between a year folder and the filename across a year boundary", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          weekly: fixedJournal("weekly", { type: "week" }, { folder: "{{date:YYYY}}", nameTemplate: "{{date:[W]ww}}" }),
        },
      },
    });
    const service = harness.resolve(NotePathService);
    const cycle = harness.resolve(CycleService);

    // Each seed day sits in a week whose start falls in the previous calendar year.
    for (const seed of ["2026-01-01", "2025-01-01", "2024-01-01"]) {
      const expected = cycle.anchorOf("weekly", CalendarDate.fromAnchor(anchor(seed)));
      assert(expected.isSome());
      const path = service.pathFor("weekly", { journalName: "weekly", anchor: expected.value });
      assert(path.isOk());
      expect(unwrap(service.candidateFor("weekly", path.value)).anchor).toBe(expected.value);
    }
  });

  it("recovers the period anchor from a note named by its start date", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          weekly: fixedJournal("weekly", { type: "week" }, { nameTemplate: "{{start_date:YYYY-MM-DD}}" }),
        },
      },
    });
    const service = harness.resolve(NotePathService);
    const day = CalendarDate.fromAnchor(anchor("2026-05-21"));
    const path = service.pathForDate("weekly", day);
    assert(path.isOk());

    const expected = harness.resolve(CycleService).anchorOf("weekly", day);

    assert(expected.isSome());
    expect(unwrap(service.candidateFor("weekly", path.value)).anchor).toBe(expected.value);
  });

  it("recovers the period anchor from a note named by its end date", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          weekly: fixedJournal("weekly", { type: "week" }, { nameTemplate: "{{end_date:YYYY-MM-DD}}" }),
        },
      },
    });
    const service = harness.resolve(NotePathService);
    const day = CalendarDate.fromAnchor(anchor("2026-05-21"));
    const path = service.pathForDate("weekly", day);
    assert(path.isOk());

    const expected = harness.resolve(CycleService).anchorOf("weekly", day);

    assert(expected.isSome());
    expect(unwrap(service.candidateFor("weekly", path.value)).anchor).toBe(expected.value);
  });

  it("captures numbering variables that appear only in the folder template", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          sprints: fixedJournal(
            "sprints",
            { type: "day" },
            {
              folder: "{{index}} - Sprints",
              nameTemplate: "{{date}}",
              numbering: {
                enabled: true,
                anchorDate: "2026-01-01" as AnchorString,
                allowBefore: false,
                sources: [
                  { variable: "index", frontmatterKey: "sprint-number", anchorValue: 1, reset: { kind: "never" } },
                ],
              },
            },
          ),
        },
      },
    });

    const result = harness.resolve(NotePathService).candidateFor("sprints", "42 - Sprints/2026-05-19.md" as VaultPath);

    const metadata = unwrap(result);
    expect(metadata.anchor).toBe("2026-05-19");
    expect(metadata.numbers?.index).toBe(42);
  });

  describe("a name template carrying a never-resetting index", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            issues: fixedJournal(
              "issues",
              { type: "day" },
              {
                nameTemplate: "Issue {{index}} - {{date}}",
                numbering: {
                  enabled: true,
                  anchorDate: "2026-01-01" as AnchorString,
                  allowBefore: false,
                  sources: [
                    { variable: "index", frontmatterKey: "issue-number", anchorValue: 1, reset: { kind: "never" } },
                  ],
                },
              },
            ),
          },
        },
      });
    });

    it("captures numbering variables when present in the template", () => {
      const result = harness.resolve(NotePathService).candidateFor("issues", "Issue 42 - 2026-05-19.md" as VaultPath);

      const metadata = unwrap(result);
      expect(metadata.anchor).toBe("2026-05-19");
      expect(metadata.numbers?.index).toBe(42);
    });

    it("keeps the date's reading when the numbering names a period the note name does not", () => {
      const result = harness.resolve(NotePathService).candidateFor("issues", "Issue 42 - 2026-05-19.md" as VaultPath);

      expect(unwrap(result).anchor).toBe("2026-05-19");
    });
  });

  it("recovers the anchor from an index-only template via numbering inversion", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: { sprints: customJournal("sprints", "week", 1, "2024-01-01", { nameTemplate: "Sprint {{index}}" }) },
      },
    });

    const result = harness.resolve(NotePathService).candidateFor("sprints", "Sprint 3.md" as VaultPath);

    const metadata = unwrap(result);
    expect(metadata.anchor).toBe("2024-01-15");
    expect(metadata.numbers?.index).toBe(3);
  });

  describe("a name template carrying the journal name", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            sprints: customJournal("sprints", "week", 1, "2024-01-01", { nameTemplate: "{{journal_name}} {{index}}" }),
          },
        },
      });
    });

    it("returns None when the filename's journal name differs from the journal", () => {
      expect(
        harness
          .resolve(NotePathService)
          .candidateFor("sprints", "Other 3.md" as VaultPath)
          .isNone(),
      ).toBe(true);
    });

    it("recovers the anchor when the filename's journal name matches", () => {
      const result = harness.resolve(NotePathService).candidateFor("sprints", "sprints 3.md" as VaultPath);

      expect(unwrap(result).numbers?.index).toBe(3);
    });
  });

  it("returns None for an index-only template when numbering is cyclic", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          sprints: customJournal("sprints", "week", 1, "2024-01-01", {
            nameTemplate: "Sprint {{index}}",
            numbering: {
              enabled: true,
              anchorDate: "2024-01-01" as AnchorString,
              allowBefore: false,
              sources: [
                {
                  variable: "index",
                  frontmatterKey: "sprint-number",
                  anchorValue: 1,
                  reset: { kind: "after", count: 3 },
                },
              ],
            },
          }),
        },
      },
    });

    expect(
      harness
        .resolve(NotePathService)
        .candidateFor("sprints", "Sprint 2.md" as VaultPath)
        .isNone(),
    ).toBe(true);
  });

  it("inverts the numbering when the name's date variable cannot tell the periods apart", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { sprints: sprintJournal("2026-01-05") } },
    });
    const service = harness.resolve(NotePathService);

    expect(unwrap(service.candidateFor("sprints", "2026-C1-S1.md" as VaultPath)).anchor).toBe("2026-01-05");
    expect(unwrap(service.candidateFor("sprints", "2026-C1-S2.md" as VaultPath)).anchor).toBe("2026-01-19");
    expect(unwrap(service.candidateFor("sprints", "2026-C2-S1.md" as VaultPath)).anchor).toBe("2026-02-16");
    expect(unwrap(service.candidateFor("sprints", "2026-C3-S3.md" as VaultPath)).anchor).toBe("2026-04-27");
  });

  // The year the date variable parses back to lands inside the journal's very first interval
  // of that year, so that one interval renders the note name it was handed — a name the rest
  // of the year renders too.
  it("inverts the numbering when the coarse date renders back the same name as its own period", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { sprints: sprintJournal("2026-01-01") } },
    });
    const service = harness.resolve(NotePathService);

    expect(unwrap(service.candidateFor("sprints", "2026-C1-S1.md" as VaultPath)).anchor).toBe("2026-01-01");
    expect(unwrap(service.candidateFor("sprints", "2026-C2-S1.md" as VaultPath)).anchor).toBe("2026-02-12");
  });

  it("finds the period a coarse date and a cyclic digit identify only together", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          monthly: fixedJournal(
            "monthly",
            { type: "month" },
            {
              nameTemplate: "{{date:YYYY}}-M{{month}}",
              numbering: {
                enabled: true,
                anchorDate: "2026-01-01" as AnchorString,
                allowBefore: false,
                sources: [
                  {
                    variable: "month",
                    frontmatterKey: "journal-month",
                    anchorValue: 1,
                    reset: { kind: "after", count: 12 },
                  },
                ],
              },
            },
          ),
        },
      },
    });
    const service = harness.resolve(NotePathService);

    expect(unwrap(service.candidateFor("monthly", "2026-M5.md" as VaultPath)).anchor).toBe("2026-05-01");
    expect(unwrap(service.candidateFor("monthly", "2026-M11.md" as VaultPath)).anchor).toBe("2026-11-01");
    expect(unwrap(service.candidateFor("monthly", "2027-M5.md" as VaultPath)).anchor).toBe("2027-05-01");
  });

  it("takes the earliest period when a coarse date and a short cycle name several alike", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          sprints: customJournal("sprints", "week", 2, "2026-01-05", {
            nameTemplate: "{{date:YYYY}}-S{{sprint}}",
            numbering: {
              enabled: true,
              anchorDate: "2026-01-05" as AnchorString,
              allowBefore: false,
              sources: [
                {
                  variable: "sprint",
                  frontmatterKey: "journal-sprint",
                  anchorValue: 1,
                  reset: { kind: "after", count: 3 },
                },
              ],
            },
          }),
        },
      },
    });

    const result = harness.resolve(NotePathService).candidateFor("sprints", "2026-S2.md" as VaultPath);

    expect(unwrap(result).anchor).toBe("2026-01-19");
  });
});

describe("NotePathService.candidateFor weekly round trip", () => {
  describe("a plain weekly journal", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { weekly: fixedJournal("weekly", { type: "week" }) } },
      });
    });

    it("resolves a weekly note name to the journal's canonical anchor", () => {
      const result = harness.resolve(NotePathService).candidateFor("weekly", "2026-W1.md" as VaultPath);

      expect(unwrap(result).anchor).toBe("2025-12-29");
    });

    it("renders a weekly note name from the week-year regardless of the stored anchor", () => {
      const meta: JournalMetadata = { journalName: "weekly", anchor: anchor("2025-12-29") };

      const result = harness.resolve(NotePathService).pathFor("weekly", meta);

      expect(result.isOk() && result.value).toBe("2026-W1.md");
    });
  });

  it("resolves a day-precision weekly note name to the week's first day", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { weekly: fixedJournal("weekly", { type: "week" }, { dateFormat: "YYYY-MM-DD" }) } },
    });

    const result = harness.resolve(NotePathService).candidateFor("weekly", "2026-01-01.md" as VaultPath);

    expect(unwrap(result).anchor).toBe("2025-12-29");
  });
});

describe("NotePathService.inverterFor", () => {
  it("inverts many paths with one prepared inverter, matching candidateFor", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          weekly: fixedJournal(
            "weekly",
            { type: "week" },
            { folder: "Weeks/{{date:YYYY}}", nameTemplate: "{{date:MM-DD}}" },
          ),
        },
      },
    });
    const service = harness.resolve(NotePathService);
    const inverter = unwrap(service.inverterFor("weekly"));

    const firstPath = "Weeks/2026/01-15.md" as VaultPath;
    const secondPath = "Weeks/2026/01-22.md" as VaultPath;
    const first = inverter.invert(firstPath);
    const second = inverter.invert(secondPath);

    expect(unwrap(first).anchor).toBe(unwrap(service.candidateFor("weekly", firstPath)).anchor);
    expect(unwrap(second).anchor).toBe(unwrap(service.candidateFor("weekly", secondPath)).anchor);
    expect(unwrap(first).anchor).not.toBe(unwrap(second).anchor);
  });

  it("returns none for a journal that does not exist", async () => {
    const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: {} } });

    expect(harness.resolve(NotePathService).inverterFor("missing").isSome()).toBe(false);
  });
});

function dateAnchorOf(context: TemplateContext, variable: string): string {
  const spec = context.get(variable);
  assert(spec?.kind === "date");
  return spec.value.toAnchor();
}

// ISO test calendar: the week anchored Mon 2025-12-29 is week 1 of 2026, running to
// Sun 2026-01-04, and its representative day is Thu 2026-01-01.
describe("contextFor — weekly period variables", () => {
  let context: TemplateContext;

  beforeEach(async () => {
    const config = fixedJournal("weekly", { type: "week" }, { dateFormat: "YYYY-MM-DD" });
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { weekly: config } },
    });
    context = harness
      .resolve(NotePathService)
      .contextFor(config, { journalName: "weekly", anchor: anchor("2025-12-29") });
  });

  it("renders date as the week's representative day", () => {
    expect(dateAnchorOf(context, "date")).toBe("2026-01-01");
  });

  it("renders start_date as the week's first day", () => {
    expect(dateAnchorOf(context, "start_date")).toBe("2025-12-29");
  });

  it("renders end_date as the week's last day", () => {
    expect(dateAnchorOf(context, "end_date")).toBe("2026-01-04");
  });
});

describe("contextFor — render-time variables", () => {
  const config = fixedJournal("daily", { type: "day" }, { dateFormat: "DD/MM/YYYY" });
  const metadata: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-20") };
  let service: NotePathService;

  beforeEach(async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: config } },
    });
    service = harness.resolve(NotePathService);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exposes current_date as a non-invertible YYYY-MM-DD date snapshot", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));

    const context = service.contextFor(config, metadata);

    const spec = context.get("current_date");
    expect(spec?.kind).toBe("date");
    assert(spec?.kind === "date");
    expect(spec.value.toAnchor()).toBe("2026-05-20");
    expect(spec.invertible).toBe(false);
  });

  it("exposes time and current_time as the same clock spec object", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));

    const context = service.contextFor(config, metadata);

    const time = context.get("time");
    const currentTime = context.get("current_time");
    expect(time?.kind).toBe("clock");
    assert(time?.kind === "clock");
    expect(time).toBe(currentTime);
    expect(time.defaultFormat).toBe("HH:mm");
  });
});

describe("bodyContextFor", () => {
  const config = fixedJournal("daily", { type: "day" }, { dateFormat: "DD/MM/YYYY" });
  const metadata: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-20") };
  let service: NotePathService;

  beforeEach(async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: config } },
    });
    service = harness.resolve(NotePathService);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aliases note_name and title to the same string spec", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));

    const body = service.bodyContextFor(config, metadata, "2026-05-20");

    const noteName = body.get("note_name");
    const title = body.get("title");
    expect(noteName?.kind).toBe("string");
    assert(noteName?.kind === "string");
    expect(noteName.value).toBe("2026-05-20");
    expect(noteName).toBe(title);
  });

  it("inherits path-context variables", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));

    const body = service.bodyContextFor(config, metadata, "2026-05-20");

    expect(body.get("date")).toBeDefined();
    expect(body.get("current_date")).toBeDefined();
    expect(body.get("time")).toBeDefined();
  });

  it("does not expose note_name in the path context", () => {
    const path = service.contextFor(config, metadata);

    expect(path.get("note_name")).toBeUndefined();
    expect(path.get("title")).toBeUndefined();
  });
});

describe("NotePathService week_of_month", () => {
  describe("a weekly note named by its month and week number", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            weekly: fixedJournal(
              "weekly",
              { type: "week" },
              {
                nameTemplate: "{{date:MMMM}} week {{week_of_month}}",
              },
            ),
          },
        },
      });
    });

    it("renders the week's position within its own month", () => {
      const meta: JournalMetadata = { journalName: "weekly", anchor: anchor("2026-09-14") };

      const result = harness.resolve(NotePathService).pathFor("weekly", meta);

      expect(result.isOk() && result.value).toBe("September week 3.md");
    });

    it("recovers the week whose number a name carries", () => {
      const result = harness.resolve(NotePathService).candidateFor("weekly", "September week 3.md" as VaultPath);

      expect(unwrap(result).anchor).toBe("2026-09-14");
    });
  });

  // Reading both halves of the name off the end of the week keeps them agreeing on a week that
  // straddles two months: August 31 2026 opens the week September 1 falls in.
  it("counts within the month the week ends in when read from the end of the week", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            { nameTemplate: "{{date<endOf=week>:MMMM}} week {{week_of_month<endOf=week>}}" },
          ),
        },
      },
    });
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-08-31") };

    const result = harness.resolve(NotePathService).pathFor("daily", meta);

    expect(result.isOk() && result.value).toBe("September week 1.md");
  });
});

describe("NotePathService.resolvedPathFor", () => {
  it("answers with the indexed note's real path when one exists", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { weekly: fixedJournal("weekly", { type: "week" }, { nameTemplate: "{{date:YYYY-[W]ww}}" }) } },
    });
    harness.resolve(JournalsIndex).register({
      journalName: "weekly",
      anchor: anchor("2026-08-17"),
      path: "Week 34 review.md" as VaultPath,
    });
    const meta: JournalMetadata = { journalName: "weekly", anchor: anchor("2026-08-17") };

    const result = harness.resolve(NotePathService).resolvedPathFor("weekly", meta);

    expect(result.isOk() && result.value).toBe("Week 34 review.md");
  });

  it("falls back to the rendered path when the period has no note yet", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };

    const result = harness.resolve(NotePathService).resolvedPathFor("daily", meta);

    expect(result.isOk() && result.value).toBe("2026-05-19.md");
  });
});

describe("NotePathService.resolvedPathForDate", () => {
  it("resolves a mid-period date to the indexed note of the period it falls in", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { weekly: fixedJournal("weekly", { type: "week" }, { nameTemplate: "{{date:YYYY-[W]ww}}" }) } },
    });
    harness.resolve(JournalsIndex).register({
      journalName: "weekly",
      anchor: anchor("2026-08-17"),
      path: "Week 34 review.md" as VaultPath,
    });

    const result = harness
      .resolve(NotePathService)
      .resolvedPathForDate("weekly", CalendarDate.fromAnchor(anchor("2026-08-20")));

    expect(result.isOk() && result.value).toBe("Week 34 review.md");
  });

  it("reports the journal as missing when it is not configured", async () => {
    const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: {} } });

    const result = harness
      .resolve(NotePathService)
      .resolvedPathForDate("nope", CalendarDate.fromAnchor(anchor("2026-05-19")));

    expect(result.isErr() && result.error).toBeInstanceOf(JournalNotFoundError);
  });
});

const bounded = (): Record<string, JournalConfig> => ({
  bounded: fixedJournal(
    "bounded",
    { type: "day" },
    { timeline: { start: anchor("2030-06-01"), end: { kind: "date", date: anchor("2030-06-30") } } },
  ),
});

describe("NotePathService.linkTargetForDate", () => {
  it("refuses a date the journal does not write and has no note for", async () => {
    const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: bounded() } });

    const result = harness
      .resolve(NotePathService)
      .linkTargetForDate("bounded", CalendarDate.fromAnchor(anchor("2030-07-10")));

    expect(result.isErr() && result.error).toBeInstanceOf(OutOfTimelineError);
  });

  it("answers with a note that exists past the timeline end", async () => {
    const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: bounded() } });
    harness.resolve(JournalsIndex).register({
      journalName: "bounded",
      anchor: anchor("2030-07-10"),
      path: "Archive/Old log.md" as VaultPath,
    });

    const result = harness
      .resolve(NotePathService)
      .linkTargetForDate("bounded", CalendarDate.fromAnchor(anchor("2030-07-10")));

    expect(result.isOk() && result.value).toBe("Archive/Old log.md");
  });

  it("renders the configured path for a date the journal writes but has no note for yet", async () => {
    const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: bounded() } });

    const result = harness
      .resolve(NotePathService)
      .linkTargetForDate("bounded", CalendarDate.fromAnchor(anchor("2030-06-15")));

    expect(result.isOk() && result.value).toBe("2030-06-15.md");
  });
});

const promptedDaily = (): Record<string, JournalConfig> => ({
  daily: fixedJournal(
    "daily",
    { type: "day" },
    {
      nameTemplate: "{{date}} {{mood}}",
      prompts: [
        {
          variable: "mood",
          question: "?",
          type: "select",
          frontmatterKey: "mood",
          required: true,
          options: [
            { label: "Good", value: "good" },
            { label: "Bad", value: "bad" },
          ],
        },
      ],
    },
  ),
});

describe("NotePathService prompt answers", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({ modules: [journalsCoreModule], data: { journals: promptedDaily() } });
  });

  it("renders the placeholder into the note name when unanswered", () => {
    const paths = harness.resolve(NotePathService);

    const path = paths.pathFor("daily", { journalName: "daily", anchor: anchor("2024-01-01") });

    expect(path.isOk() && path.value).toBe("2024-01-01 (unanswered).md");
  });

  it("renders the answer into the note name when answered", () => {
    const paths = harness.resolve(NotePathService);

    const path = paths.pathFor("daily", {
      journalName: "daily",
      anchor: anchor("2024-01-01"),
      answers: { mood: "good" },
    });

    expect(path.isOk() && path.value).toBe("2024-01-01 good.md");
  });

  it("renders an unanswered prompt as empty in the body, not as the placeholder", () => {
    const paths = harness.resolve(NotePathService);
    const engine = harness.resolve(TemplateEngine);
    const config = paths.configFor("daily");
    assert(config, "expected the journal config");

    const context = paths.bodyContextFor(config, { journalName: "daily", anchor: anchor("2024-01-01") }, "n");

    expect(engine.renderString("mood: {{mood}}", context)).toBe("mood: ");
  });

  it("keeps an answered prompt in the body", () => {
    const paths = harness.resolve(NotePathService);
    const engine = harness.resolve(TemplateEngine);
    const config = paths.configFor("daily");
    assert(config, "expected the journal config");
    const metadata: JournalMetadata = {
      journalName: "daily",
      anchor: anchor("2024-01-01"),
      answers: { mood: "good" },
    };

    const context = paths.bodyContextFor(config, metadata, "n");

    expect(engine.renderString("mood: {{mood}}", context)).toBe("mood: good");
  });

  it("inverts an answered name and recovers the answer", () => {
    const candidate = harness.resolve(NotePathService).candidateFor("daily", "2024-01-01 good.md" as VaultPath);

    expect(unwrap(candidate).answers).toEqual({ mood: "good" });
    expect(unwrap(candidate).anchor).toBe("2024-01-01");
  });

  it("inverts a placeholder name and recovers no answer", () => {
    const candidate = harness.resolve(NotePathService).candidateFor("daily", "2024-01-01 (unanswered).md" as VaultPath);

    expect(unwrap(candidate).anchor).toBe("2024-01-01");
    expect(unwrap(candidate).answers).toBeUndefined();
  });

  // Both halves, because the negative one alone proves nothing about the seeding: with the
  // prompt slot unseeded the name holds an unknown variable, the parse fails, and "whatever"
  // yields the same none. The positive half reds when #parseContext stops seeding prompts; the
  // negative half reds when the seeded slot stops being bounded to its own option values and
  // starts capturing arbitrary text as an answer.
  it("claims a name whose slot holds a select value, and none whose slot holds anything else", () => {
    const paths = harness.resolve(NotePathService);

    const known = paths.candidateFor("daily", "2024-01-01 bad.md" as VaultPath);
    const unknown = paths.candidateFor("daily", "2024-01-01 whatever.md" as VaultPath);

    expect(unwrap(known).answers).toEqual({ mood: "bad" });
    expect(unknown.isNone()).toBe(true);
  });

  it("renders the placeholder into the folder when unanswered", async () => {
    const journals = promptedDaily();
    const daily = { ...journals.daily, nameTemplate: "{{date}}", folder: "Journal/{{mood}}" } as JournalConfig;
    const scoped = await testContainer({ modules: [journalsCoreModule], data: { journals: { daily } } });

    const path = scoped
      .resolve(NotePathService)
      .pathFor("daily", { journalName: "daily", anchor: anchor("2024-01-01") });

    expect(path.isOk() && path.value).toBe("Journal/(unanswered)/2024-01-01.md");
  });

  it("recovers an answer that reached the folder rather than the name", async () => {
    const journals = promptedDaily();
    const daily = { ...journals.daily, nameTemplate: "{{date}}", folder: "Journal/{{mood}}" } as JournalConfig;
    const scoped = await testContainer({ modules: [journalsCoreModule], data: { journals: { daily } } });

    const candidate = scoped.resolve(NotePathService).candidateFor("daily", "Journal/bad/2024-01-01.md" as VaultPath);

    expect(unwrap(candidate).answers).toEqual({ mood: "bad" });
  });
});

const promptedSprints = (): Record<string, JournalConfig> => ({
  sprints: customJournal("sprints", "week", 2, "2026-01-05", {
    nameTemplate: "{{date:YYYY}}-S{{sprint}} {{mood}}",
    prompts: [
      {
        variable: "mood",
        question: "?",
        type: "select",
        frontmatterKey: "mood",
        required: true,
        options: [
          { label: "Good", value: "good" },
          { label: "Bad", value: "bad" },
        ],
      },
    ],
    numbering: {
      enabled: true,
      anchorDate: "2026-01-05" as AnchorString,
      allowBefore: false,
      sources: [
        { variable: "sprint", frontmatterKey: "journal-sprint", anchorValue: 1, reset: { kind: "after", count: 3 } },
      ],
    },
  }),
});

// A custom cycle whose date variable is too coarse to name its period relies on the
// re-render walk in `inverterFor`. That walk renders through `pathFor`, so it only agrees
// with the path it is inverting if the recovered answers are rendered back into it.
describe("NotePathService.candidateFor on a numbered custom cycle carrying a prompt", () => {
  it("finds the period a coarse answered name belongs to", async () => {
    const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: promptedSprints() } });

    const candidate = harness.resolve(NotePathService).candidateFor("sprints", "2026-S2 good.md" as VaultPath);

    expect(unwrap(candidate).anchor).toBe("2026-01-19");
    expect(unwrap(candidate).answers).toEqual({ mood: "good" });
  });

  it("finds the same period when the name is unanswered", async () => {
    const harness = await testContainer({ modules: [journalsCoreModule], data: { journals: promptedSprints() } });

    const candidate = harness.resolve(NotePathService).candidateFor("sprints", "2026-S2 (unanswered).md" as VaultPath);

    expect(unwrap(candidate).anchor).toBe("2026-01-19");
    expect(unwrap(candidate).answers).toBeUndefined();
  });
});
