import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Calendar, WeekPeriod, calendarSlice } from "@/calendar";
import { CalendarSettingsBridge } from "@/calendar/settings/bridge";
import { date, installTestCalendar, testCalendar } from "@/calendar/testing";
import { NoticeService, NotesService, TemplaterService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNoticeService, FakeNotesService, FakeTemplaterService } from "@/infrastructure/host/testing";
import { SettingsService } from "@/settings";
import { createSettingsService } from "@/settings/testing";
import { TemplateEngine } from "@/templates";

import { CycleService } from "../cycle";
import { FrontmatterService } from "../frontmatter";
import { JournalsIndex } from "../journals-index";
import { NoteConnectionService } from "../notes/note-connection";
import { NoteCreationService } from "../notes/note-creation";
import { NotePathService } from "../notes/note-path";
import { SelfWriteGuard } from "../notes/self-write-guard";
import { TemplateContentService } from "../notes/template-content";
import { NumberingService } from "../numbering";
import { JournalsRepository } from "../repository";
import { customJournal, fakeRepo, fixedJournal } from "../testing";

import { WeekPresetService } from "./week-preset-service";

import type { JournalConfig } from "../config";

const ISO = { mode: "custom", dow: 1, doy: 4, global: false } as const;
const WESTERN = { mode: "custom", dow: 0, doy: 6, global: false } as const;

function weekly(patch: { addStartDate?: boolean; addEndDate?: boolean } = {}): Record<string, JournalConfig> {
  const config = fixedJournal("weekly", { type: "week" });
  return { weekly: { ...config, frontmatter: { ...config.frontmatter, ...patch } } };
}

async function build(journals: Record<string, JournalConfig>) {
  const notes = new FakeNotesService();
  const settings = createSettingsService({
    slices: [calendarSlice],
    raw: { version: 4, calendar: ISO },
  });
  const c = settings.container;
  c.register(Calendar).useValue(testCalendar());
  c.register(NotesService).useValue(notes as unknown as NotesService);
  c.register(NoticeService).useValue(new FakeNoticeService());
  c.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  c.register(TemplaterService).useValue(new FakeTemplaterService() as unknown as TemplaterService);
  c.register(JournalsRepository).useValue(fakeRepo(journals));
  c.register(JournalsIndex).useClass(JournalsIndex);
  c.register(CycleService).useClass(CycleService);
  c.register(NumberingService).useClass(NumberingService);
  c.register(FrontmatterService).useClass(FrontmatterService);
  c.register(TemplateEngine).useClass(TemplateEngine);
  c.register(TemplateContentService).useClass(TemplateContentService);
  c.register(NotePathService).useClass(NotePathService);
  c.register(SelfWriteGuard).useClass(SelfWriteGuard);
  c.register(NoteCreationService).useClass(NoteCreationService);
  c.register(NoteConnectionService).useClass(NoteConnectionService);
  c.register(CalendarSettingsBridge).useClass(CalendarSettingsBridge);
  c.register(WeekPresetService).useClass(WeekPresetService);

  await settings.service.initialize();
  // Resolving the bridge starts the watchEffect that applies the grid, exactly as autoLoad does.
  c.resolve(CalendarSettingsBridge);

  return { container: c, notes, index: c.resolve(JournalsIndex), service: c.resolve(WeekPresetService) };
}

function seedWeek(notes: FakeNotesService, index: JournalsIndex, path: string, date: string): void {
  notes.seed(path as VaultPath, "", { journal: "weekly", "journal-date": date });
  index.register({ journalName: "weekly", anchor: date as never, path: path as VaultPath });
}

describe("WeekPresetService", () => {
  let teardown: () => void;

  beforeEach(() => {
    ({ teardown } = installTestCalendar({ dow: 1, doy: 4 }));
  });
  afterEach(() => {
    teardown();
  });

  it("moves a weekly note's date onto the new grid's week start", async () => {
    const { notes, index, service } = await build(weekly());
    seedWeek(notes, index, "week/2026-W23.md", "2026-06-01");

    await service.apply(WESTERN);

    expect(notes.frontmatterOf("week/2026-W23.md" as VaultPath)?.["journal-date"]).toBe("2026-05-31");
  });

  it("keeps the note's week number across the change", async () => {
    const { notes, index, service } = await build(weekly());
    seedWeek(notes, index, "week/2026-W23.md", "2026-06-01");

    await service.apply(WESTERN);

    // Read the date the service actually wrote and ask the new grid what week it is —
    // asserting a hardcoded date here would pass without the note being touched at all.
    const written = String(notes.frontmatterOf("week/2026-W23.md" as VaultPath)?.["journal-date"]);
    expect(WeekPeriod.containing(date(written)).weekOfYear).toBe(23);
  });

  it("keeps the week-year of a note whose week straddles January 1", async () => {
    const { notes, index, service } = await build(weekly());
    // ISO week 1 of 2026 starts on 2025-12-29; under the Western grid it starts on 2025-12-28.
    seedWeek(notes, index, "week/2026-W01.md", "2025-12-29");

    await service.apply(WESTERN);

    expect(notes.frontmatterOf("week/2026-W01.md" as VaultPath)?.["journal-date"]).toBe("2025-12-28");
  });

  it("recomputes the start date field against the new grid", async () => {
    const { notes, index, service } = await build(weekly({ addStartDate: true }));
    seedWeek(notes, index, "week/2026-W23.md", "2026-06-01");

    await service.apply(WESTERN);

    expect(notes.frontmatterOf("week/2026-W23.md" as VaultPath)?.["journal-start-date"]).toBe("2026-05-31");
  });

  it("recomputes the end date field against the new grid", async () => {
    const { notes, index, service } = await build(weekly({ addEndDate: true }));
    seedWeek(notes, index, "week/2026-W23.md", "2026-06-01");

    await service.apply(WESTERN);

    expect(notes.frontmatterOf("week/2026-W23.md" as VaultPath)?.["journal-end-date"]).toBe("2026-06-06");
  });

  // Regression: the old grid's own week end ("2026-06-07" for ISO week 23) is period metadata,
  // not a manual extension. Judging it against the NEW grid's default (as opposed to the OLD
  // grid's, captured before the switch) would wrongly read it as an extension and freeze the
  // note on the old grid's end date forever — the exact bug the week-preset e2e spec caught.
  it("recomputes the end date to the new week's own end when the stored value was the old grid's own end", async () => {
    const { notes, index, service } = await build(weekly({ addEndDate: true }));
    notes.seed("week/2026-W23.md" as VaultPath, "", {
      journal: "weekly",
      "journal-date": "2026-06-01",
      "journal-end-date": "2026-06-07",
    });
    index.register({
      journalName: "weekly",
      anchor: "2026-06-01" as never,
      path: "week/2026-W23.md" as VaultPath,
      endDate: "2026-06-07" as never,
    });

    await service.apply(WESTERN);

    expect(notes.frontmatterOf("week/2026-W23.md" as VaultPath)?.["journal-end-date"]).toBe("2026-06-06");
  });

  it("keeps a manually extended end date across a grid change", async () => {
    const { notes, index, service } = await build(weekly({ addEndDate: false }));
    notes.seed("week/2026-W23.md" as VaultPath, "", {
      journal: "weekly",
      "journal-date": "2026-06-01",
      "journal-end-date": "2026-06-21",
    });
    index.register({
      journalName: "weekly",
      anchor: "2026-06-01" as never,
      path: "week/2026-W23.md" as VaultPath,
      endDate: "2026-06-21" as never,
    });

    await service.apply(WESTERN);

    expect(notes.frontmatterOf("week/2026-W23.md" as VaultPath)?.["journal-end-date"]).toBe("2026-06-21");
  });

  it("drops a stored end date that was only the old grid's own week end when addEndDate is off", async () => {
    const { notes, index, service } = await build(weekly({ addEndDate: false }));
    notes.seed("week/2026-W23.md" as VaultPath, "", {
      journal: "weekly",
      "journal-date": "2026-06-01",
      "journal-end-date": "2026-06-07",
    });
    index.register({
      journalName: "weekly",
      anchor: "2026-06-01" as never,
      path: "week/2026-W23.md" as VaultPath,
      endDate: "2026-06-07" as never,
    });

    await service.apply(WESTERN);

    expect("journal-end-date" in (notes.frontmatterOf("week/2026-W23.md" as VaultPath) ?? {})).toBe(false);
  });

  it("stores the new preset in the calendar slice", async () => {
    const { container, service } = await build(weekly());

    await service.apply(WESTERN);

    expect(container.resolve(SettingsService).getSlice(calendarSlice).state).toEqual(WESTERN);
  });

  it("leaves weekly notes alone when only the global flag changes", async () => {
    const { notes, index, service } = await build(weekly());
    seedWeek(notes, index, "week/2026-W23.md", "2026-06-01");

    await service.apply({ ...ISO, global: true });

    expect(notes.frontmatterOf("week/2026-W23.md" as VaultPath)?.["journal-date"]).toBe("2026-06-01");
  });

  it("leaves a month journal's notes alone", async () => {
    const monthly = fixedJournal("monthly", { type: "month" });
    const { notes, index, service } = await build({ ...weekly(), monthly });
    notes.seed("month/2026-06.md" as VaultPath, "", { journal: "monthly", "journal-date": "2026-06-01" });
    index.register({ journalName: "monthly", anchor: "2026-06-01" as never, path: "month/2026-06.md" as VaultPath });

    await service.apply(WESTERN);

    expect(notes.frontmatterOf("month/2026-06.md" as VaultPath)?.["journal-date"]).toBe("2026-06-01");
  });

  it("leaves a custom weekly interval's notes alone", async () => {
    const sprints = customJournal("sprints", "week", 2, "2026-06-01");
    const { notes, index, service } = await build({ ...weekly(), sprints });
    notes.seed("sprints/1.md" as VaultPath, "", { journal: "sprints", "journal-date": "2026-06-01" });
    index.register({ journalName: "sprints", anchor: "2026-06-01" as never, path: "sprints/1.md" as VaultPath });

    await service.apply(WESTERN);

    expect(notes.frontmatterOf("sprints/1.md" as VaultPath)?.["journal-date"]).toBe("2026-06-01");
  });
});
