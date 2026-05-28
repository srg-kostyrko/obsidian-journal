import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarDate, WeekPeriod } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import { DecorationEngine } from "@/decorations";
import { initLocale } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import {
  NoteMetadataService,
  NotesService,
  WorkspaceService,
  type NotesEvents,
  type VaultPath,
} from "@/infrastructure/host";
import { FakeNoteMetadataService } from "@/infrastructure/host/testing";
import { LoggerFactory, LoggerFactoryToken } from "@/infrastructure/logger";
import { AsyncResult, Option } from "@/infrastructure/result";
import {
  CycleService,
  JournalsIndex,
  JournalsRepository,
  JournalsViewModel,
  OpenDateFlow,
  TimelineService,
  type JournalConfig,
  type JournalEntry,
  type JournalsEvents,
} from "@/journals";
import { fixedJournal } from "@/journals/testing";
import { ShelvesEventsToken, ShelvesRepository, type ShelfConfig, type ShelvesEvents } from "@/shelves";

import { ActiveEntryViewModel } from "../active-entry";

import NotesWeekView from "./NotesWeekView.vue";

class FakeJournalsIndex {
  events = createNanoEvents();
  entryByPath() {
    return Option.none<JournalEntry>();
  }
  entryByAnchor() {
    return Option.none<JournalEntry>();
  }
  findNext() {
    return Option.none<VaultPath>();
  }
  findPrevious() {
    return Option.none<VaultPath>();
  }
}

class FakeWorkspace {
  events = createNanoEvents();
  openNote() {
    return AsyncResult.ok(undefined);
  }
  activeNote() {
    return Option.none<VaultPath>();
  }
  triggerHoverPreview() {
    return;
  }
  openFileMenu() {
    return;
  }
}

class FakeTimeline {
  contains() {
    return true;
  }
}

class FakeFlows {
  invoke() {
    return AsyncResult.ok({ path: "x" as VaultPath, created: false });
  }
}

interface Harness {
  container: Container;
}

function buildHarness(journals: Record<string, JournalConfig>, shelves: Record<string, ShelfConfig>): Harness {
  const container = new Container();
  container.register(LoggerFactoryToken).useClass(LoggerFactory);
  const journalsEvents = createNanoEvents<JournalsEvents>();
  container.register(JournalsRepository).useValue(JournalsRepository.fromParts(journals, journalsEvents));
  container.register(JournalsViewModel).useClass(JournalsViewModel);
  const shelvesEvents = createNanoEvents<ShelvesEvents>();
  container.register(ShelvesEventsToken).useValue(shelvesEvents);
  container.register(ShelvesRepository).useValue(ShelvesRepository.fromParts(shelves, shelvesEvents));
  container.register(JournalsIndex).useValue(new FakeJournalsIndex() as unknown as JournalsIndex);
  container.register(WorkspaceService).useValue(new FakeWorkspace() as unknown as WorkspaceService);
  container.register(TimelineService).useValue(new FakeTimeline() as unknown as TimelineService);
  container.register(Flows).useValue(new FakeFlows() as unknown as Flows);
  container.register(OpenDateFlow).useValue({} as OpenDateFlow);
  container.register(NotesService).useValue({ events: createNanoEvents<NotesEvents>() } as unknown as NotesService);
  container.register(NoteMetadataService).useValue(new FakeNoteMetadataService() as unknown as NoteMetadataService);
  container.register(CycleService).useClass(CycleService);
  container.register(DecorationEngine).useClass(DecorationEngine);
  container.register(ActiveEntryViewModel).useClass(ActiveEntryViewModel);
  return { container };
}

function mount(h: Harness, props: { shelf: string | null; week: WeekPeriod }) {
  return render(NotesWeekView, {
    props,
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, h.container);
          },
        },
      ],
    },
  });
}

const week = WeekPeriod.containing(CalendarDate.fromAnchor("2026-05-27" as never));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeAll(() => initLocale("en"));

describe("NotesWeekView", () => {
  let teardown: () => void;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00Z"));
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => teardown());

  describe("day cells", () => {
    it("renders one cell per day of the week", () => {
      const h = buildHarness({ daily: fixedJournal("daily", { type: "day" }) }, {});
      mount(h, { shelf: null, week });
      const expectedDays = [...week.days()].map((d) => d.format("D"));
      for (const label of expectedDays) {
        expect(screen.getAllByText(label).length).toBeGreaterThan(0);
      }
    });
  });

  describe("week-number cell", () => {
    it("renders the week-number cell when scope has a week journal", () => {
      const h = buildHarness(
        {
          daily: fixedJournal("daily", { type: "day" }),
          weekly: fixedJournal("weekly", { type: "week" }),
        },
        {},
      );
      const { container } = mount(h, { shelf: null, week });
      expect(container.querySelector('[data-testid="week-number-cell"]')).toBeTruthy();
    });

    it("omits the week-number cell when scope has no week journal", () => {
      const h = buildHarness({ daily: fixedJournal("daily", { type: "day" }) }, {});
      const { container } = mount(h, { shelf: null, week });
      expect(container.querySelector('[data-testid="week-number-cell"]')).toBeNull();
    });
  });

  describe("header badges", () => {
    it("renders the month header badge", () => {
      const h = buildHarness({ monthly: fixedJournal("monthly", { type: "month" }) }, {});
      const { container } = mount(h, { shelf: null, week });
      expect(container.querySelector('[data-testid="header-month"]')).toBeTruthy();
    });

    it("renders the year header badge", () => {
      const h = buildHarness({ yearly: fixedJournal("yearly", { type: "year" }) }, {});
      const { container } = mount(h, { shelf: null, week });
      expect(container.querySelector('[data-testid="header-year"]')).toBeTruthy();
    });

    it("renders the quarter header badge when scope has a quarter journal", () => {
      const h = buildHarness({ quarterly: fixedJournal("quarterly", { type: "quarter" }) }, {});
      const { container } = mount(h, { shelf: null, week });
      expect(container.querySelector('[data-testid="header-quarter"]')).toBeTruthy();
    });

    it("omits the quarter header badge when scope has no quarter journal", () => {
      const h = buildHarness({ daily: fixedJournal("daily", { type: "day" }) }, {});
      const { container } = mount(h, { shelf: null, week });
      expect(container.querySelector('[data-testid="header-quarter"]')).toBeNull();
    });
  });

  describe("header slot", () => {
    it("replaces the default header row when #header is provided", () => {
      const h = buildHarness({ daily: fixedJournal("daily", { type: "day" }) }, {});
      const { container } = render(NotesWeekView, {
        props: { shelf: null, week },
        slots: { header: "<div data-testid='custom-header'>X</div>" },
        global: {
          plugins: [
            {
              install(app) {
                provideInjectorOnApp(app, h.container);
              },
            },
          ],
        },
      });
      expect(container.querySelector('[data-testid="custom-header"]')).toBeTruthy();
      expect(container.querySelector('[data-testid="header-month"]')).toBeNull();
    });
  });
});
