import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, within } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reactive } from "vue";

import { Calendar, DayPeriod, type AnchorString, type Period } from "@/calendar";
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
import { NoteMetadataService, type VaultPath } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNoteMetadataService } from "@/infrastructure/host/testing";
import { CycleService, JournalsIndex, JournalsRepository, TimelineService, type JournalsEvents } from "@/journals";
import type { JournalConfig } from "@/journals/config";
import { customJournal, fixedJournal } from "@/journals/testing";
import { createSettingsService } from "@/settings/testing";
import { ShelvesRepository, type ShelvesEvents } from "@/shelves";
import type { ShelfConfig } from "@/shelves/config";

import { buildCalendarDecoration, buildCondition, buildDecoration, buildStyle } from "../testing";

import DecorationBreakdownModal from "./DecorationBreakdownModal.vue";

const ANY_DATE_TEXT = m.decoration_condition_date_describe({
  day: m.decoration_condition_date_any(),
  month: m.decoration_condition_date_any(),
  year: m.decoration_condition_date_any(),
});

interface Note {
  readonly journalName: string;
  readonly anchor: DayPeriod;
}

interface MountOptions {
  journals?: Record<string, JournalConfig>;
  shelves?: Record<string, ShelfConfig>;
  globalDecorations?: readonly CalendarDecoration[];
  period?: Period;
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
  container.register(DecorationEngine).useClass(DecorationEngine);
  container.register(Calendar).useValue(testCalendar());
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);

  render(DecorationBreakdownModal, {
    props: { period: options.period },
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

describe("DecorationBreakdownModal", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
    cleanup();
  });

  it("shows a section for each decorated cell the date belongs to", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    mount({
      journals: {
        daily: fixedJournal("daily", { type: "day" }, { decorations: [anyDayDecoration] }),
        weekly: fixedJournal("weekly", { type: "week" }, { decorations: [anyDayDecoration] }),
      },
      period: day,
    });

    expect(screen.getAllByTestId("decoration-preview")).toHaveLength(2);
  });

  it("omits a cell no decoration matched", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    mount({
      journals: {
        daily: fixedJournal("daily", { type: "day" }, { decorations: [anyDayDecoration] }),
        weekly: fixedJournal("weekly", { type: "week" }, { decorations: [] }),
      },
      period: day,
    });

    expect(screen.getAllByTestId("decoration-preview")).toHaveLength(1);
  });

  it("highlights the section for the entry-point cell", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    mount({
      journals: {
        daily: fixedJournal("daily", { type: "day" }, { decorations: [hasNoteDecoration] }),
        weekly: fixedJournal("weekly", { type: "week" }, { decorations: [anyDayDecoration] }),
      },
      notes: [{ journalName: "daily", anchor: day }],
      period: day,
    });

    // getByText throws on 0 or 2+ matches, so this alone proves the badge is singular.
    const badge = screen.getByText(m.decoration_breakdown_entry_badge());
    const entryRegion = badge.closest('[role="region"]');
    expect(entryRegion).not.toBeNull();

    // The entry point was the day cell (daily's has-note rule), not the week cell
    // (weekly's date-wildcard rule) — proves the highlighted section is the right one.
    expect(within(entryRegion as HTMLElement).getByText(m.decoration_condition_has_note_describe())).toBeTruthy();
    expect(within(entryRegion as HTMLElement).queryByText(ANY_DATE_TEXT)).toBeNull();
  });

  it("names the winning decoration for a resolved property", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    mount({
      journals: { daily: fixedJournal("daily", { type: "day" }, { decorations: [hasNoteDecoration] }) },
      globalDecorations: [anyDayCalendarDecoration],
      notes: [{ journalName: "daily", anchor: day }],
      period: day,
    });

    const winnerGroup = screen.getByRole("group", {
      name: m.decoration_breakdown_property({ property: "background" }),
    });
    expect(within(winnerGroup).getByText(m.decoration_condition_has_note_describe())).toBeTruthy();
    expect(
      within(winnerGroup).getByText(m.decoration_breakdown_owner({ kind: "journal", name: "daily" })),
    ).toBeTruthy();
  });

  it("lists a contribution that lost a property under the overridden heading", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    mount({
      journals: { daily: fixedJournal("daily", { type: "day" }, { decorations: [hasNoteDecoration] }) },
      globalDecorations: [anyDayCalendarDecoration],
      notes: [{ journalName: "daily", anchor: day }],
      period: day,
    });

    const overriddenGroup = screen.getByRole("group", {
      name: m.decoration_breakdown_overridden_for({
        property: m.decoration_breakdown_property({ property: "background" }),
      }),
    });
    expect(within(overriddenGroup).getByText(ANY_DATE_TEXT)).toBeTruthy();
    expect(within(overriddenGroup).getByText(m.decoration_breakdown_owner({ kind: "global", name: "" }))).toBeTruthy();
  });

  it("interleaves the mode word between an OR decoration's conditions", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    const orDecoration: JournalDecoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("has-note"), buildCondition("date", { day: -1, month: -1, year: null })],
      styles: [buildStyle("background")],
    });
    mount({
      journals: { daily: fixedJournal("daily", { type: "day" }, { decorations: [orDecoration] }) },
      notes: [{ journalName: "daily", anchor: day }],
      period: day,
    });

    expect(screen.getByText(m.decoration_condition_has_note_describe())).toBeTruthy();
    expect(screen.getByText(ANY_DATE_TEXT)).toBeTruthy();
    expect(screen.getByText(m.decoration_describe_mode({ kind: "or" }))).toBeTruthy();
  });

  it("lists marks without naming a winner", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    const journalMark: JournalDecoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("has-note")],
      styles: [buildStyle("shape")],
    });
    const globalMark: CalendarDecoration = buildCalendarDecoration({
      mode: "or",
      conditions: [buildCondition("date", { day: -1, month: -1, year: null })],
      styles: [buildStyle("shape")],
    });
    mount({
      journals: { daily: fixedJournal("daily", { type: "day" }, { decorations: [journalMark] }) },
      globalDecorations: [globalMark],
      notes: [{ journalName: "daily", anchor: day }],
      period: day,
    });

    expect(screen.getByText(m.decoration_breakdown_marks_heading())).toBeTruthy();
    expect(screen.getByText(m.decoration_condition_has_note_describe())).toBeTruthy();
    expect(screen.getByText(ANY_DATE_TEXT)).toBeTruthy();
    expect(screen.queryByText(m.decoration_breakdown_overridden_heading())).toBeNull();
  });

  it("admits a custom journal's offset decoration to the day cell", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    const offsetDecoration: JournalDecoration = buildDecoration({
      mode: "or",
      conditions: [buildCondition("offset", { offset: 1 })],
      styles: [buildStyle("background")],
    });
    mount({
      journals: {
        sprint: customJournal("sprint", "week", 2, "2026-05-25", { decorations: [offsetDecoration] }),
      },
      period: day,
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
      period: day,
    });

    // The day cell gets zero contributions once the offset-only filter excludes this
    // decoration, so the entry-point section (the day cell, per `period: day`) never renders.
    // The decoration still surfaces — in the interval section, covered below.
    expect(screen.queryByText(m.decoration_breakdown_entry_badge())).toBeNull();
  });

  it("shows an interval section for a custom journal's non-offset decoration", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    mount({
      journals: {
        sprint: customJournal("sprint", "week", 2, "2026-05-25", { decorations: [hasNoteDecoration] }),
      },
      notes: [{ journalName: "sprint", anchor: day }],
      period: day,
    });

    const heading = screen.getByText(
      m.decoration_breakdown_interval_heading({ journal: "sprint", label: "2026-05-25" }),
    );
    const region = heading.closest('[role="region"]');
    expect(region).not.toBeNull();
    expect(within(region as HTMLElement).getByText(m.decoration_condition_has_note_describe())).toBeTruthy();
  });

  it("keeps the interval section's accessible name intact for a journal name containing a space", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    mount({
      journals: {
        "sprint planning": customJournal("sprint planning", "week", 2, "2026-05-25", {
          decorations: [hasNoteDecoration],
        }),
      },
      notes: [{ journalName: "sprint planning", anchor: day }],
      period: day,
    });

    const heading = m.decoration_breakdown_interval_heading({ journal: "sprint planning", label: "2026-05-25" });
    // `aria-labelledby` tokenizes on whitespace, so an id built from the raw journal name would
    // resolve to nonexistent ids and the region would lose its accessible name entirely.
    expect(screen.getByRole("region", { name: heading })).toBeTruthy();
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
      period: day,
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

  it("highlights only the day section when opened from a day cell that starts an interval", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    mount({
      journals: {
        daily: fixedJournal("daily", { type: "day" }, { decorations: [anyDayDecoration] }),
        sprint: customJournal("sprint", "week", 2, "2026-05-25", { decorations: [hasNoteDecoration] }),
      },
      notes: [{ journalName: "sprint", anchor: day }],
      period: day,
    });

    // getByText throws on 2+ matches, so this alone proves only one section carries the badge.
    const badge = screen.getByText(m.decoration_breakdown_entry_badge());
    const dayRegion = badge.closest('[role="region"]');
    expect(dayRegion).not.toBeNull();

    const intervalHeading = screen.getByText(
      m.decoration_breakdown_interval_heading({ journal: "sprint", label: "2026-05-25" }),
    );
    const intervalRegion = intervalHeading.closest('[role="region"]');
    expect(intervalRegion).not.toBeNull();
    expect(intervalRegion).not.toBe(dayRegion);
    expect(within(intervalRegion as HTMLElement).queryByText(m.decoration_breakdown_entry_badge())).toBeNull();
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
      period: day,
    });

    expect(
      screen.queryByText(m.decoration_breakdown_interval_heading({ journal: "sprint", label: "2026-05-25" })),
    ).toBeNull();
  });

  it("re-resolves when the shelf selection changes", async () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    mount({
      shelves: {
        work: { name: "work", journals: [], decorations: [] },
        home: { name: "home", journals: [], decorations: [anyDayCalendarDecoration] },
      },
      period: day,
    });

    // "All journals" unions every shelf's list, so narrowing to a shelf that owns none drops it.
    expect(screen.getByTestId("decoration-preview")).toBeTruthy();

    await userEvent.selectOptions(screen.getByRole("combobox"), "work");

    expect(screen.getByText(m.decoration_breakdown_empty())).toBeTruthy();
  });

  it("shows the empty state for a date nothing decorates", () => {
    const day = DayPeriod.containing(date("2026-05-25"));
    mount({ period: day });

    expect(screen.getByText(m.decoration_breakdown_empty())).toBeTruthy();
  });
});
