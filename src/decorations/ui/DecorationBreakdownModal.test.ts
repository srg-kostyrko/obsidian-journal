import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, within } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, reactive } from "vue";

import { Calendar, DayPeriod, type AnchorString } from "@/calendar";
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
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNoteMetadataService, FakeNoteSizeService } from "@/infrastructure/host/testing";
import { CycleService, JournalsIndex, JournalsRepository, TimelineService, type JournalsEvents } from "@/journals";
import type { JournalConfig } from "@/journals/config";
import { customJournal, fixedJournal } from "@/journals/testing";
import { createSettingsService } from "@/settings/testing";
import { ShelvesRepository, type ShelvesEvents } from "@/shelves";
import type { ShelfConfig } from "@/shelves/config";

import { buildCalendarDecoration, buildCondition, buildDecoration, buildStyle } from "../testing";

import DecorationBreakdownModal from "./DecorationBreakdownModal.vue";

interface Note {
  readonly journalName: string;
  readonly anchor: DayPeriod;
}

interface MountOptions {
  journals?: Record<string, JournalConfig>;
  shelves?: Record<string, ShelfConfig>;
  globalDecorations?: readonly CalendarDecoration[];
  shelf?: string | null;
  // Registered into JournalsIndex before render, so has-note conditions resolve on the very
  // first computed read — JournalsIndex is event-based rather than Vue-reactive, so seeding it
  // after mount would need a manual re-trigger instead of just asserting the rendered output.
  notes?: readonly Note[];
}

function mount(options: MountOptions = {}) {
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
  const size = new FakeNoteSizeService();
  container.register(NoteSizeService).useValue(size as unknown as NoteSizeService);
  container.register(DecorationEngine).useClass(DecorationEngine);
  container.register(Calendar).useValue(testCalendar());
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);

  render(DecorationBreakdownModal, {
    props: { shelf: options.shelf },
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

  return { size };
}

const anyDayDecoration: JournalDecoration = buildDecoration({
  mode: "or",
  conditions: [buildCondition("date", { day: -1, month: -1, year: null })],
  styles: [buildStyle("background")],
});

const anyDayCalendarDecoration: CalendarDecoration = buildCalendarDecoration({
  mode: "or",
  conditions: [buildCondition("date", { day: -1, month: -1, year: null })],
  styles: [buildStyle("background")],
});

const hasNoteDecoration: JournalDecoration = buildDecoration({
  mode: "or",
  conditions: [buildCondition("has-note")],
  styles: [buildStyle("background")],
});

const noteSizeDecoration: JournalDecoration = buildDecoration({
  mode: "or",
  conditions: [buildCondition("note-size", { condition: "gt", value: 100 })],
  styles: [buildStyle("background")],
});

describe("DecorationBreakdownModal", () => {
  let teardown: () => void;
  beforeEach(() => {
    // The explorer defaults its anchor to CalendarDate.today(), so the fixtures' custom-journal
    // intervals (anchored at 2026-05-25) need the system clock pinned there to stay date-stable.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-25T10:00:00Z"));
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
    cleanup();
    vi.useRealTimers();
  });

  it("shows a section for each decorated cell the date belongs to", () => {
    mount({
      journals: {
        daily: fixedJournal("daily", { type: "day" }, { decorations: [anyDayDecoration] }),
        weekly: fixedJournal("weekly", { type: "week" }, { decorations: [anyDayDecoration] }),
      },
    });

    expect(screen.getAllByTestId("decoration-preview")).toHaveLength(2);
  });

  it("omits a cell no decoration matched", () => {
    mount({
      journals: {
        daily: fixedJournal("daily", { type: "day" }, { decorations: [anyDayDecoration] }),
        weekly: fixedJournal("weekly", { type: "week" }, { decorations: [] }),
      },
    });

    expect(screen.getAllByTestId("decoration-preview")).toHaveLength(1);
  });

  it("admits a custom journal's offset decoration to the day cell", () => {
    const offsetDecoration: JournalDecoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("offset", { offset: 1 })],
      styles: [buildStyle("background")],
    });
    mount({
      journals: {
        sprint: customJournal("sprint", "week", 2, "2026-05-25", { decorations: [offsetDecoration] }),
      },
    });

    expect(screen.getByText(m.decoration_condition_offset_describe({ side: "start", day: 1 }))).toBeTruthy();
  });

  it("excludes a custom journal's non-offset decoration from the day cell", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    const nonOffsetDecoration: JournalDecoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("has-note")],
      styles: [buildStyle("background")],
    });
    mount({
      journals: {
        sprint: customJournal("sprint", "week", 2, "2026-05-25", { decorations: [nonOffsetDecoration] }),
      },
      notes: [{ journalName: "sprint", anchor: day }],
    });

    // The day cell gets zero contributions once the offset-only filter excludes this
    // decoration, so no day section renders. It still surfaces in the interval section below.
    expect(screen.queryByText(m.decoration_breakdown_cell_heading({ kind: "day", label: "2026-05-25" }))).toBeNull();
  });

  it("shows an interval section for a custom journal's non-offset decoration", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    mount({
      journals: {
        sprint: customJournal("sprint", "week", 2, "2026-05-25", { decorations: [hasNoteDecoration] }),
      },
      notes: [{ journalName: "sprint", anchor: day }],
    });

    const heading = screen.getByText(
      m.decoration_breakdown_interval_heading({ journal: "sprint", label: "2026-05-25" }),
    );
    const region = heading.closest('[role="region"]');
    expect(region).not.toBeNull();
    expect(within(region as HTMLElement).getByText(m.decoration_condition_has_note_describe())).toBeTruthy();
  });

  it("keeps a custom journal's offset decoration out of the interval section", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    const offsetDecoration: JournalDecoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("offset", { offset: 1 })],
      styles: [buildStyle("background")],
    });
    mount({
      journals: {
        sprint: customJournal("sprint", "week", 2, "2026-05-25", {
          decorations: [hasNoteDecoration, offsetDecoration],
        }),
      },
      notes: [{ journalName: "sprint", anchor: day }],
    });

    const heading = screen.getByText(
      m.decoration_breakdown_interval_heading({ journal: "sprint", label: "2026-05-25" }),
    );
    const region = heading.closest('[role="region"]');
    expect(region).not.toBeNull();
    expect(
      within(region as HTMLElement).queryByText(m.decoration_condition_offset_describe({ side: "start", day: 1 })),
    ).toBeNull();
  });

  it("omits an interval section for a journal whose timeline excludes the interval", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    mount({
      journals: {
        sprint: customJournal("sprint", "week", 2, "2026-05-25", {
          decorations: [hasNoteDecoration],
          timeline: { start: "2026-07-01" as AnchorString, end: { kind: "never" } },
        }),
      },
      notes: [{ journalName: "sprint", anchor: day }],
    });

    expect(
      screen.queryByText(m.decoration_breakdown_interval_heading({ journal: "sprint", label: "2026-05-25" })),
    ).toBeNull();
  });

  it("re-resolves when the shelf selection changes", async () => {
    mount({
      shelves: {
        work: { name: "work", journals: [], decorations: [] },
        home: { name: "home", journals: [], decorations: [anyDayCalendarDecoration] },
      },
    });

    // "All journals" unions every shelf's list, so narrowing to a shelf that owns none drops it.
    expect(screen.getByTestId("decoration-preview")).toBeTruthy();

    await userEvent.selectOptions(screen.getByRole("combobox"), "work");

    expect(screen.getByText(m.decoration_breakdown_empty())).toBeTruthy();
  });

  it("resolves against the shelf it was opened under", async () => {
    mount({
      shelves: {
        work: { name: "work", journals: [], decorations: [] },
        home: { name: "home", journals: [], decorations: [anyDayCalendarDecoration] },
      },
      shelf: "work",
    });

    expect(screen.getByText(m.decoration_breakdown_empty())).toBeTruthy();

    // Widening to all journals unions every shelf, so home's rule surfaces — proving the
    // empty state above came from the seeded scope and not from an unpopulated fixture.
    await userEvent.selectOptions(screen.getByRole("combobox"), "");

    expect(screen.getByTestId("decoration-preview")).toBeTruthy();
  });

  it("shows the empty state for a date nothing decorates", () => {
    mount({});

    expect(screen.getByText(m.decoration_breakdown_empty())).toBeTruthy();
  });

  it("shows a note-size decoration once its size lands", async () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    const path = "daily/2026-05-25.md" as VaultPath;
    const { size } = mount({
      journals: {
        daily: fixedJournal("daily", { type: "day" }, { decorations: [noteSizeDecoration] }),
      },
      notes: [{ journalName: "daily", anchor: day }],
    });

    expect(screen.getByText(m.decoration_breakdown_empty())).toBeTruthy();

    size.setSize(path, { words: 400, characters: 2200 });
    await nextTick();

    expect(screen.getByTestId("decoration-preview")).toBeTruthy();
  });
});
