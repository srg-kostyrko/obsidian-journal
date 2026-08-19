import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reactive } from "vue";

import { Calendar, DayPeriod, WeekPeriod } from "@/calendar";
import { date, installTestCalendar, testCalendar } from "@/calendar/testing";
import {
  DecorationEngine,
  DecorationsStore,
  decorationsSlice,
  type CalendarDecoration,
  type JournalDecoration,
} from "@/decorations";
import { m } from "@/i18n";
import { provideInjectorOnApp } from "@/infrastructure/di";
import { NoteMetadataService, NoteSizeService, type VaultPath } from "@/infrastructure/host";
import { FakeNoteMetadataService, FakeNoteSizeService } from "@/infrastructure/host/testing";
import { CycleService, JournalsIndex, JournalsRepository, TimelineService, type JournalsEvents } from "@/journals";
import type { JournalConfig } from "@/journals/config";
import { customJournal, fixedJournal } from "@/journals/testing";
import { createSettingsService } from "@/settings/testing";
import { ShelvesRepository, type ShelvesEvents } from "@/shelves";
import type { ShelfConfig } from "@/shelves/config";

import { buildCalendarDecoration, buildCondition, buildDecoration, buildStyle } from "../testing";

import DecorationCellModal from "./DecorationCellModal.vue";

import type { BreakdownEntry } from "./breakdown-entry";

interface Note {
  readonly journalName: string;
  readonly anchor: DayPeriod;
}

interface MountOptions {
  journals?: Record<string, JournalConfig>;
  shelves?: Record<string, ShelfConfig>;
  globalDecorations?: readonly CalendarDecoration[];
  notes?: readonly Note[];
  entry: BreakdownEntry;
  shelf?: string | null;
}

function mount(options: MountOptions) {
  const { container, service } = createSettingsService({ slices: [decorationsSlice] });
  service.getSlice(decorationsSlice).state = { decorations: [...(options.globalDecorations ?? [])] };

  const journalStorage = reactive<Record<string, JournalConfig>>({ ...options.journals });
  const journals = JournalsRepository.fromParts(journalStorage, createNanoEvents<JournalsEvents>());

  const shelfStorage = reactive<Record<string, ShelfConfig>>({ ...options.shelves });
  const shelves = ShelvesRepository.fromParts(shelfStorage, createNanoEvents<ShelvesEvents>());

  const fakeMetadata = new FakeNoteMetadataService();
  const index = new JournalsIndex();
  const notes = options.notes ?? [];
  for (const note of notes) {
    const path = `${note.journalName}/${note.anchor.anchor.toAnchor()}.md` as VaultPath;
    index.register({ journalName: note.journalName, anchor: note.anchor.anchor.toAnchor(), path });
    fakeMetadata.setMetadata(path, { title: note.journalName, tags: [], properties: {}, tasks: [] });
  }

  container.register(JournalsRepository).useValue(journals);
  container.register(ShelvesRepository).useValue(shelves);
  container.register(DecorationsStore).useClass(DecorationsStore);
  container.register(JournalsIndex).useValue(index);
  container.register(CycleService).useClass(CycleService);
  container.register(TimelineService).useClass(TimelineService);
  container.register(NoteMetadataService).useValue(fakeMetadata as unknown as NoteMetadataService);
  container.register(NoteSizeService).useValue(new FakeNoteSizeService() as unknown as NoteSizeService);
  container.register(DecorationEngine).useClass(DecorationEngine);
  container.register(Calendar).useValue(testCalendar());

  render(DecorationCellModal, {
    props: { entry: options.entry, shelf: options.shelf },
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
          },
        },
      ],
    },
  });
}

const anyDayDecoration: JournalDecoration = buildDecoration({
  mode: "or",
  conditions: [buildCondition("date", { day: -1, month: -1, year: null })],
  styles: [buildStyle("background")],
});

const hasNoteDecoration: JournalDecoration = buildDecoration({
  mode: "or",
  conditions: [buildCondition("has-note")],
  styles: [buildStyle("background")],
});

const anyDayCalendarDecoration: CalendarDecoration = buildCalendarDecoration({
  mode: "or",
  conditions: [buildCondition("date", { day: -1, month: -1, year: null })],
  styles: [buildStyle("background")],
});

describe("DecorationCellModal", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
    cleanup();
  });

  it("renders only the clicked cell when the date also belongs to a decorated week cell", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    mount({
      journals: {
        daily: fixedJournal("daily", { type: "day" }, { decorations: [hasNoteDecoration] }),
        weekly: fixedJournal("weekly", { type: "week" }, { decorations: [anyDayDecoration] }),
      },
      notes: [{ journalName: "daily", anchor: day }],
      entry: { kind: "fixed", period: day },
    });

    expect(screen.getByText(m.decoration_breakdown_cell_heading({ kind: "day", label: "2026-05-25" }))).toBeTruthy();
    expect(screen.getAllByTestId("decoration-preview")).toHaveLength(1);
  });

  it("resolves a week entry against the week cell", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    const week = WeekPeriod.containing(date("2026-05-25"));
    mount({
      journals: {
        daily: fixedJournal("daily", { type: "day" }, { decorations: [hasNoteDecoration] }),
        weekly: fixedJournal("weekly", { type: "week" }, { decorations: [anyDayDecoration] }),
      },
      notes: [{ journalName: "daily", anchor: day }],
      entry: { kind: "fixed", period: week },
    });

    expect(screen.getByText(m.decoration_breakdown_owner({ kind: "journal", name: "weekly" }))).toBeTruthy();
  });

  it("resolves an interval entry against the interval's own decorations", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    mount({
      journals: {
        sprint: customJournal("sprint", "week", 2, "2026-05-25", { decorations: [hasNoteDecoration] }),
      },
      notes: [{ journalName: "sprint", anchor: day }],
      entry: { kind: "interval", period: day, journalName: "sprint" },
    });

    // A non-offset custom decoration belongs to the interval, never to the day cell that
    // shares its anchor — the interval heading is what proves the right side was resolved.
    expect(
      screen.getByText(m.decoration_breakdown_interval_heading({ journal: "sprint", label: "2026-05-25" })),
    ).toBeTruthy();
  });

  it("resolves a day entry against the day cell when that day starts an interval", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    mount({
      journals: {
        daily: fixedJournal("daily", { type: "day" }, { decorations: [anyDayDecoration] }),
        sprint: customJournal("sprint", "week", 2, "2026-05-25", { decorations: [hasNoteDecoration] }),
      },
      notes: [{ journalName: "sprint", anchor: day }],
      entry: { kind: "fixed", period: day },
    });

    expect(screen.getByText(m.decoration_breakdown_cell_heading({ kind: "day", label: "2026-05-25" }))).toBeTruthy();
    expect(
      screen.queryByText(m.decoration_breakdown_interval_heading({ journal: "sprint", label: "2026-05-25" })),
    ).toBeNull();
  });

  it("resolves against the shelf it was opened under", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    mount({
      shelves: {
        work: { name: "work", journals: [], decorations: [] },
        home: { name: "home", journals: [], decorations: [anyDayCalendarDecoration] },
      },
      entry: { kind: "fixed", period: day },
      shelf: "work",
    });

    expect(screen.getByText(m.decoration_breakdown_cell_empty())).toBeTruthy();
  });

  it("re-resolves when the shelf selection changes", async () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    mount({
      shelves: {
        work: { name: "work", journals: [], decorations: [] },
        home: { name: "home", journals: [], decorations: [anyDayCalendarDecoration] },
      },
      entry: { kind: "fixed", period: day },
      shelf: "home",
    });

    expect(screen.getByTestId("decoration-preview")).toBeTruthy();

    await userEvent.selectOptions(screen.getByRole("combobox"), "work");

    expect(screen.getByText(m.decoration_breakdown_cell_empty())).toBeTruthy();
  });
});
