import { describe, it, expect, vi, beforeEach, afterEach, assert } from "vitest";

import { CalendarDate, type AnchorString } from "@/calendar";
import { anchor, installTestCalendar } from "@/calendar/testing";
import { Container } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import { LoggerModule } from "@/infrastructure/logger";
import { TemplateEngine } from "@/templates";

import { CycleService } from "../cycle";
import { JournalNotFoundError } from "../errors";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NumberingService } from "../numbering";
import { JournalsRepository } from "../repository";
import { customJournal, fakeRepo, fixedJournal, unwrap } from "../testing";

import { EmptyNoteNameError } from "./errors";
import { NotePathService } from "./note-path";

import type { JournalConfig } from "../config";
import type { JournalMetadata } from "../types";

function buildContainer(repo: JournalsRepository): Container {
  const c = new Container();
  c.addModule(LoggerModule);
  c.register(JournalsRepository).useValue(repo);
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(TemplateEngine).useClass(TemplateEngine);
  c.register(NotePathService).useClass(NotePathService);
  return c;
}

describe("NotePathService.pathFor", () => {
  it("renders nameTemplate with .md suffix when folder is empty", () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
    const c = buildContainer(repo);
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };
    const result = c.resolve(NotePathService).pathFor("daily", meta);
    expect(result.isOk() && result.value).toBe("2026-05-19.md");
  });

  it("renders a capitalized date variable rather than emitting it raw", () => {
    const repo = fakeRepo({
      daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "{{Date:YYYY-MM-DD}}" }),
    });
    const c = buildContainer(repo);
    const result = c.resolve(NotePathService).pathForDate("daily", CalendarDate.fromAnchor(anchor("2026-05-19")));
    expect(result.isOk() && result.value).toBe("2026-05-19.md");
  });

  it("prefixes folder when configured", () => {
    const repo = fakeRepo({
      daily: fixedJournal("daily", { type: "day" }, { folder: "Diary/{{date:YYYY}}" }),
    });
    const c = buildContainer(repo);
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };
    const result = c.resolve(NotePathService).pathFor("daily", meta);
    expect(result.isOk() && result.value).toBe("Diary/2026/2026-05-19.md");
  });

  it("resolves {{note_name}} in the folder template to the rendered note name", () => {
    const repo = fakeRepo({
      daily: fixedJournal("daily", { type: "day" }, { folder: "Journal/{{note_name}}" }),
    });
    const c = buildContainer(repo);
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };
    const result = c.resolve(NotePathService).pathFor("daily", meta);
    expect(result.isOk() && result.value).toBe("Journal/2026-05-19/2026-05-19.md");
  });

  it("treats {{title}} as an alias for the note name in the folder template", () => {
    const repo = fakeRepo({
      daily: fixedJournal("daily", { type: "day" }, { folder: "Journal/{{title}}" }),
    });
    const c = buildContainer(repo);
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };
    const result = c.resolve(NotePathService).pathFor("daily", meta);
    expect(result.isOk() && result.value).toBe("Journal/2026-05-19/2026-05-19.md");
  });

  it("returns JournalNotFoundError for an unknown journal", () => {
    const repo = fakeRepo({});
    const c = buildContainer(repo);
    const meta: JournalMetadata = { journalName: "missing", anchor: anchor("2026-05-19") };
    const result = c.resolve(NotePathService).pathFor("missing", meta);
    expect(result.isErr() && result.error instanceof JournalNotFoundError).toBe(true);
  });

  it("returns EmptyNoteNameError when the name template is blank", () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "" }) });
    const c = buildContainer(repo);
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };
    const result = c.resolve(NotePathService).pathFor("daily", meta);
    expect(result.isErr() && result.error instanceof EmptyNoteNameError).toBe(true);
  });

  it("returns EmptyNoteNameError when the name template is only whitespace", () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }, { nameTemplate: " ".repeat(3) }) });
    const c = buildContainer(repo);
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };
    const result = c.resolve(NotePathService).pathFor("daily", meta);
    expect(result.isErr() && result.error instanceof EmptyNoteNameError).toBe(true);
  });

  it("returns EmptyNoteNameError when every variable in the name template renders empty", () => {
    const repo = fakeRepo({
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
    });
    const c = buildContainer(repo);
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };
    const result = c.resolve(NotePathService).pathFor("daily", meta);
    expect(result.isErr() && result.error instanceof EmptyNoteNameError).toBe(true);
  });

  it("resolves the path when only the folder template renders empty", () => {
    const repo = fakeRepo({
      daily: fixedJournal("daily", { type: "day" }, { folder: "" }),
    });
    const c = buildContainer(repo);
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };
    const result = c.resolve(NotePathService).pathFor("daily", meta);
    expect(result.isOk() && result.value).toBe("2026-05-19.md");
  });

  it("renders an empty string for a numbering variable with no resolved value", () => {
    const repo = fakeRepo({
      sprints: customJournal("sprints", "week", 1, "2024-01-01", { nameTemplate: "{{journal_name}} {{index}}" }),
    });
    const c = buildContainer(repo);
    const meta: JournalMetadata = { journalName: "sprints", anchor: anchor("2024-01-01") };
    const result = c.resolve(NotePathService).pathFor("sprints", meta);
    expect(result.isOk() && result.value).toBe("sprints .md");
  });
});

describe("NotePathService.pathForDate", () => {
  it("resolves the note path for a date in a fixed day journal", () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
    const c = buildContainer(repo);
    const result = c.resolve(NotePathService).pathForDate("daily", CalendarDate.fromAnchor(anchor("2026-05-19")));
    expect(result.isOk() && result.value).toBe("2026-05-19.md");
  });

  it("resolves the enclosing week note when the journal writes weeks", () => {
    const repo = fakeRepo({ weekly: fixedJournal("weekly", { type: "week" }) });
    const c = buildContainer(repo);
    const result = c.resolve(NotePathService).pathForDate("weekly", CalendarDate.fromAnchor(anchor("2026-05-19")));
    expect(result.isOk() && result.value).toMatch(/^\d{4}-W\d{1,2}\.md$/);
  });

  it("returns JournalNotFoundError for an unknown journal", () => {
    const repo = fakeRepo({});
    const c = buildContainer(repo);
    const result = c.resolve(NotePathService).pathForDate("missing", CalendarDate.fromAnchor(anchor("2026-05-19")));
    expect(result.isErr() && result.error instanceof JournalNotFoundError).toBe(true);
  });
});

describe("NotePathService.noteNameFor", () => {
  it("renders the name template without the folder or the .md extension", () => {
    const config = fixedJournal("daily", { type: "day" }, { folder: "Journals/{{date:YYYY}}" });
    const c = buildContainer(fakeRepo({ daily: config }));
    const meta: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-19") };
    expect(c.resolve(NotePathService).noteNameFor(config, meta)).toBe("2026-05-19");
  });

  it("renders a numbering variable from the metadata's stored numbers", () => {
    const config = customJournal("sprint", "week", 2, "2024-01-01", { nameTemplate: "Sprint {{index}}" });
    const c = buildContainer(fakeRepo({ sprint: config }));
    const meta: JournalMetadata = { journalName: "sprint", anchor: anchor("2024-01-15"), numbers: { index: 2 } };
    expect(c.resolve(NotePathService).noteNameFor(config, meta)).toBe("Sprint 2");
  });
});

describe("NotePathService.candidateFor", () => {
  it("inverts a {{date}}.md path into a metadata anchor", () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
    const c = buildContainer(repo);
    const result = c.resolve(NotePathService).candidateFor("daily", "2026-05-19.md" as VaultPath);
    const metadata = unwrap(result);
    expect(metadata.anchor).toBe("2026-05-19");
    expect(metadata.journalName).toBe("daily");
  });

  it("inverts a path whose template capitalized the date variable", () => {
    const repo = fakeRepo({
      daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "{{Date:YYYY-MM-DD}}" }),
    });
    const c = buildContainer(repo);
    const result = c.resolve(NotePathService).candidateFor("daily", "2026-05-19.md" as VaultPath);
    expect(unwrap(result).anchor).toBe("2026-05-19");
  });

  it("returns None when the path doesn't match the template", () => {
    const repo = fakeRepo({ daily: fixedJournal("daily", { type: "day" }) });
    const c = buildContainer(repo);
    const result = c.resolve(NotePathService).candidateFor("daily", "Inbox/note.md" as VaultPath);
    expect(result.isNone()).toBe(true);
  });

  it("inverts folder + name combined", () => {
    const repo = fakeRepo({
      daily: fixedJournal("daily", { type: "day" }, { folder: "Diary/{{date:YYYY}}" }),
    });
    const c = buildContainer(repo);
    const result = c.resolve(NotePathService).candidateFor("daily", "Diary/2026/2026-05-19.md" as VaultPath);
    const metadata = unwrap(result);
    expect(metadata.anchor).toBe("2026-05-19");
  });

  it("inverts a date split across folder segments and the filename", () => {
    const repo = fakeRepo({
      daily: fixedJournal(
        "daily",
        { type: "day" },
        { folder: "Journals/{{date:YYYY}}/{{date:MM}}", nameTemplate: "{{date:DD}}" },
      ),
    });
    const c = buildContainer(repo);
    const result = c.resolve(NotePathService).candidateFor("daily", "Journals/2026/05/19.md" as VaultPath);
    expect(unwrap(result).anchor).toBe("2026-05-19");
  });

  it("inverts a date split across multiple tokens in the filename", () => {
    const repo = fakeRepo({
      daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "{{date:YYYY}}-{{date:MM}}-{{date:DD}}" }),
    });
    const c = buildContainer(repo);
    const result = c.resolve(NotePathService).candidateFor("daily", "2026-05-19.md" as VaultPath);
    expect(unwrap(result).anchor).toBe("2026-05-19");
  });

  it("inverts a quarter split between a year folder and the filename", () => {
    const repo = fakeRepo({
      quarterly: fixedJournal(
        "quarterly",
        { type: "quarter" },
        { folder: "Quarters/{{date:YYYY}}", nameTemplate: "{{date:[Q]Q}}" },
      ),
    });
    const c = buildContainer(repo);
    const svc = c.resolve(NotePathService);
    expect(unwrap(svc.candidateFor("quarterly", "Quarters/2027/Q3.md" as VaultPath)).anchor).toBe("2027-07-01");
    expect(unwrap(svc.candidateFor("quarterly", "Quarters/2025/Q1.md" as VaultPath)).anchor).toBe("2025-01-01");
  });

  it("round-trips every quarter of a split template, including across years", () => {
    const repo = fakeRepo({
      quarterly: fixedJournal(
        "quarterly",
        { type: "quarter" },
        { folder: "Quarters/{{date:YYYY}}", nameTemplate: "{{date:[Q]Q}}" },
      ),
    });
    const c = buildContainer(repo);
    const svc = c.resolve(NotePathService);
    for (const a of ["2025-01-01", "2025-04-01", "2025-07-01", "2025-10-01", "2027-10-01"]) {
      const path = svc.pathFor("quarterly", { journalName: "quarterly", anchor: anchor(a) });
      assert(path.isOk());
      expect(unwrap(svc.candidateFor("quarterly", path.value)).anchor).toBe(a);
    }
  });

  // A week's tokens render from its representative day, so the year written into the folder is the
  // week-year -- a week starting in the previous calendar year has to invert back to its own start.
  it("round-trips a week split between a year folder and the filename across a year boundary", () => {
    const repo = fakeRepo({
      weekly: fixedJournal("weekly", { type: "week" }, { folder: "{{date:YYYY}}", nameTemplate: "{{date:[W]ww}}" }),
    });
    const c = buildContainer(repo);
    const svc = c.resolve(NotePathService);
    const cycle = c.resolve(CycleService);
    // Each seed day sits in a week whose start falls in the previous calendar year.
    for (const seed of ["2026-01-01", "2025-01-01", "2024-01-01"]) {
      const expected = cycle.anchorOf("weekly", CalendarDate.fromAnchor(anchor(seed)));
      assert(expected.isSome());
      const path = svc.pathFor("weekly", { journalName: "weekly", anchor: expected.value });
      assert(path.isOk());
      expect(unwrap(svc.candidateFor("weekly", path.value)).anchor).toBe(expected.value);
    }
  });

  it("recovers the period anchor from a note named by its start date", () => {
    const repo = fakeRepo({
      weekly: fixedJournal("weekly", { type: "week" }, { nameTemplate: "{{start_date:YYYY-MM-DD}}" }),
    });
    const c = buildContainer(repo);
    const svc = c.resolve(NotePathService);
    const day = CalendarDate.fromAnchor(anchor("2026-05-21"));
    const path = svc.pathForDate("weekly", day);
    assert(path.isOk());
    const expected = c.resolve(CycleService).anchorOf("weekly", day);
    assert(expected.isSome());
    expect(unwrap(svc.candidateFor("weekly", path.value)).anchor).toBe(expected.value);
  });

  it("recovers the period anchor from a note named by its end date", () => {
    const repo = fakeRepo({
      weekly: fixedJournal("weekly", { type: "week" }, { nameTemplate: "{{end_date:YYYY-MM-DD}}" }),
    });
    const c = buildContainer(repo);
    const svc = c.resolve(NotePathService);
    const day = CalendarDate.fromAnchor(anchor("2026-05-21"));
    const path = svc.pathForDate("weekly", day);
    assert(path.isOk());
    const expected = c.resolve(CycleService).anchorOf("weekly", day);
    assert(expected.isSome());
    expect(unwrap(svc.candidateFor("weekly", path.value)).anchor).toBe(expected.value);
  });

  it("captures numbering variables that appear only in the folder template", () => {
    const repo = fakeRepo({
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
            sources: [{ variable: "index", frontmatterKey: "sprint-number", anchorValue: 1, reset: { kind: "never" } }],
          },
        },
      ),
    });
    const c = buildContainer(repo);
    const result = c.resolve(NotePathService).candidateFor("sprints", "42 - Sprints/2026-05-19.md" as VaultPath);
    const metadata = unwrap(result);
    expect(metadata.anchor).toBe("2026-05-19");
    expect(metadata.numbers?.index).toBe(42);
  });

  it("captures numbering variables when present in the template", () => {
    const repo = fakeRepo({
      issues: fixedJournal(
        "issues",
        { type: "day" },
        {
          nameTemplate: "Issue {{index}} - {{date}}",
          numbering: {
            enabled: true,
            anchorDate: "2026-01-01" as AnchorString,
            allowBefore: false,
            sources: [{ variable: "index", frontmatterKey: "issue-number", anchorValue: 1, reset: { kind: "never" } }],
          },
        },
      ),
    });
    const c = buildContainer(repo);
    const result = c.resolve(NotePathService).candidateFor("issues", "Issue 42 - 2026-05-19.md" as VaultPath);
    const metadata = unwrap(result);
    expect(metadata.anchor).toBe("2026-05-19");
    expect(metadata.numbers?.index).toBe(42);
  });

  it("recovers the anchor from an index-only template via numbering inversion", () => {
    const repo = fakeRepo({
      sprints: customJournal("sprints", "week", 1, "2024-01-01", { nameTemplate: "Sprint {{index}}" }),
    });
    const c = buildContainer(repo);
    const result = c.resolve(NotePathService).candidateFor("sprints", "Sprint 3.md" as VaultPath);
    const metadata = unwrap(result);
    expect(metadata.anchor).toBe("2024-01-15");
    expect(metadata.numbers?.index).toBe(3);
  });

  it("returns None when the filename's journal name differs from the journal", () => {
    const repo = fakeRepo({
      sprints: customJournal("sprints", "week", 1, "2024-01-01", { nameTemplate: "{{journal_name}} {{index}}" }),
    });
    const c = buildContainer(repo);
    expect(
      c
        .resolve(NotePathService)
        .candidateFor("sprints", "Other 3.md" as VaultPath)
        .isNone(),
    ).toBe(true);
  });

  it("recovers the anchor when the filename's journal name matches", () => {
    const repo = fakeRepo({
      sprints: customJournal("sprints", "week", 1, "2024-01-01", { nameTemplate: "{{journal_name}} {{index}}" }),
    });
    const c = buildContainer(repo);
    const result = c.resolve(NotePathService).candidateFor("sprints", "sprints 3.md" as VaultPath);
    const metadata = unwrap(result);
    expect(metadata.numbers?.index).toBe(3);
  });

  it("returns None for an index-only template when numbering is cyclic", () => {
    const repo = fakeRepo({
      sprints: customJournal("sprints", "week", 1, "2024-01-01", {
        nameTemplate: "Sprint {{index}}",
        numbering: {
          enabled: true,
          anchorDate: "2024-01-01" as AnchorString,
          allowBefore: false,
          sources: [
            { variable: "index", frontmatterKey: "sprint-number", anchorValue: 1, reset: { kind: "after", count: 3 } },
          ],
        },
      }),
    });
    const c = buildContainer(repo);
    expect(
      c
        .resolve(NotePathService)
        .candidateFor("sprints", "Sprint 2.md" as VaultPath)
        .isNone(),
    ).toBe(true);
  });
});

describe("NotePathService.candidateFor weekly round trip", () => {
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  it("resolves a weekly note name to the journal's canonical anchor", () => {
    const repo = fakeRepo({ weekly: fixedJournal("weekly", { type: "week" }) });
    const c = buildContainer(repo);

    const result = c.resolve(NotePathService).candidateFor("weekly", "2026-W1.md" as VaultPath);

    expect(unwrap(result).anchor).toBe("2025-12-29");
  });

  it("resolves a day-precision weekly note name to the week's first day", () => {
    const repo = fakeRepo({
      weekly: fixedJournal("weekly", { type: "week" }, { dateFormat: "YYYY-MM-DD" }),
    });
    const c = buildContainer(repo);

    const result = c.resolve(NotePathService).candidateFor("weekly", "2026-01-01.md" as VaultPath);

    expect(unwrap(result).anchor).toBe("2025-12-29");
  });

  it("renders a weekly note name from the week-year regardless of the stored anchor", () => {
    const repo = fakeRepo({ weekly: fixedJournal("weekly", { type: "week" }) });
    const c = buildContainer(repo);
    const meta: JournalMetadata = { journalName: "weekly", anchor: anchor("2025-12-29") };

    const result = c.resolve(NotePathService).pathFor("weekly", meta);

    expect(result.isOk() && result.value).toBe("2026-W1.md");
  });
});

describe("NotePathService.inverterFor", () => {
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  it("inverts many paths with one prepared inverter, matching candidateFor", () => {
    const repo = fakeRepo({
      weekly: fixedJournal(
        "weekly",
        { type: "week" },
        { folder: "Weeks/{{date:YYYY}}", nameTemplate: "{{date:MM-DD}}" },
      ),
    });
    const c = buildContainer(repo);
    const service = c.resolve(NotePathService);
    const inverter = unwrap(service.inverterFor("weekly"));

    const firstPath = "Weeks/2026/01-15.md" as VaultPath;
    const secondPath = "Weeks/2026/01-22.md" as VaultPath;
    const first = inverter.invert(firstPath);
    const second = inverter.invert(secondPath);

    expect(unwrap(first).anchor).toBe(unwrap(service.candidateFor("weekly", firstPath)).anchor);
    expect(unwrap(second).anchor).toBe(unwrap(service.candidateFor("weekly", secondPath)).anchor);
    expect(unwrap(first).anchor).not.toBe(unwrap(second).anchor);
  });

  it("returns none for a journal that does not exist", () => {
    const c = buildContainer(fakeRepo({}));
    expect(c.resolve(NotePathService).inverterFor("missing").isSome()).toBe(false);
  });
});

// ISO test calendar: the week anchored Mon 2025-12-29 is week 1 of 2026, running to
// Sun 2026-01-04, and its representative day is Thu 2026-01-01.
function weeklyContextValue(variable: string): string {
  const config = fixedJournal("weekly", { type: "week" }, { dateFormat: "YYYY-MM-DD" });
  const service = buildContainer(fakeRepo({ weekly: config })).resolve(NotePathService);
  const context = service.contextFor(config, { journalName: "weekly", anchor: anchor("2025-12-29") });
  const spec = context.get(variable);
  assert(spec?.kind === "date");
  return spec.value.toAnchor();
}

describe("contextFor — weekly period variables", () => {
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  it("renders date as the week's representative day", () => {
    expect(weeklyContextValue("date")).toBe("2026-01-01");
  });

  it("renders start_date as the week's first day", () => {
    expect(weeklyContextValue("start_date")).toBe("2025-12-29");
  });

  it("renders end_date as the week's last day", () => {
    expect(weeklyContextValue("end_date")).toBe("2026-01-04");
  });
});

function buildFixture(): { service: NotePathService; config: JournalConfig; metadata: JournalMetadata } {
  const config = fixedJournal("daily", { type: "day" }, { dateFormat: "DD/MM/YYYY" });
  const repo = fakeRepo({ daily: config });
  const service = buildContainer(repo).resolve(NotePathService);
  const metadata: JournalMetadata = { journalName: "daily", anchor: anchor("2026-05-20") };
  return { service, config, metadata };
}

describe("contextFor — render-time variables", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exposes current_date as a non-invertible YYYY-MM-DD date snapshot", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const { service, config, metadata } = buildFixture();
    const context = service.contextFor(config, metadata);
    const spec = context.get("current_date");
    expect(spec?.kind).toBe("date");
    assert(spec?.kind === "date");
    expect(spec.value.toAnchor()).toBe("2026-05-20");
    expect(spec.invertible).toBe(false);
  });

  it("exposes time and current_time as the same clock spec object", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const { service, config, metadata } = buildFixture();
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
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("aliases note_name and title to the same string spec", () => {
    vi.setSystemTime(new Date("2026-05-20T10:37:42"));
    const { service, config, metadata } = buildFixture();
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
    const { service, config, metadata } = buildFixture();
    const body = service.bodyContextFor(config, metadata, "2026-05-20");
    expect(body.get("date")).toBeDefined();
    expect(body.get("current_date")).toBeDefined();
    expect(body.get("time")).toBeDefined();
  });

  it("does not expose note_name in the path context", () => {
    const { service, config, metadata } = buildFixture();
    const path = service.contextFor(config, metadata);
    expect(path.get("note_name")).toBeUndefined();
    expect(path.get("title")).toBeUndefined();
  });
});
