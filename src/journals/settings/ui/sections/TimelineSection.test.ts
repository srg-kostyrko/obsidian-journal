import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reactive } from "vue";

import { Calendar, DayPeriod, type AnchorString, type OpenInterval } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { InputSuggestService, NotesService, TemplaterService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNotesService, FakeTemplaterService } from "@/infrastructure/host/testing";
import {
  CycleService,
  FrontmatterService,
  JournalsRepository,
  JournalsViewModel,
  NotePathService,
  NumberingService,
  journalDefaultsFor,
  type JournalConfig,
  type JournalsEvents,
} from "@/journals";
import { JournalsIndex } from "@/journals/journals-index";
import { AutoCreateService } from "@/journals/notes/auto-create";
import { JournalsEventsToken } from "@/journals/tokens";
import { TemplateEngine } from "@/templates";
import { installTestEngine } from "@/templates/testing";

import TimelineSection from "./TimelineSection.vue";

let teardown: () => void;
beforeEach(() => {
  ({ teardown } = installTestCalendar());
});
afterEach(() => {
  teardown();
  cleanup();
});

function mount(overrides: Partial<JournalConfig> = {}) {
  const fakeModalService = new FakeModalService();
  const container = new Container();
  const storage = reactive<Record<string, JournalConfig>>({
    daily: { ...journalDefaultsFor({ type: "day" }, "daily"), ...overrides },
  });
  const events = createNanoEvents<JournalsEvents>();
  const repo = JournalsRepository.fromParts(storage, events);
  container.register(JournalsEventsToken).useValue(events);
  container.register(JournalsRepository).useValue(repo);
  container.register(JournalsViewModel).useValue(JournalsViewModel.fromRepository(repo));
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(CycleService).useClass(CycleService);
  container.register(NumberingService).useClass(NumberingService);
  container.register(FrontmatterService).useClass(FrontmatterService);
  container.register(NotePathService).useClass(NotePathService);
  container.register(TemplateEngine).useValue(installTestEngine());
  container.register(TemplaterService).useValue(new FakeTemplaterService() as unknown as TemplaterService);
  container.register(NotesService).useValue(new FakeNotesService() as unknown as NotesService);
  container.register(InputSuggestService).useValue(new FakeInputSuggestService() as unknown as InputSuggestService);
  container.register(ModalService).useValue(fakeModalService as unknown as ModalService);
  container.register(Calendar).useValue(new Calendar());
  container
    .register(AutoCreateService)
    .useValue({ createCurrent: () => Promise.resolve() } as unknown as AutoCreateService);
  render(TimelineSection, {
    props: { journalName: "daily" },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
  return { storage, repo, fakeModalService };
}

describe("TimelineSection", () => {
  describe("timeline.start DatePicker", () => {
    it("writes the picked date to timeline.start", async () => {
      const { storage, fakeModalService } = mount({
        timeline: { start: "2024-01-01" as AnchorString, end: { kind: "never" } },
      });
      await userEvent.click(screen.getByText(m.journal_edit_section_timeline()));
      await userEvent.click(screen.getByRole("button", { name: "2024-01-01" }));
      fakeModalService.lastOpen<unknown, DayPeriod>().submit(DayPeriod.containing(date("2025-03-15")));
      await waitFor(() => {
        expect(storage.daily?.timeline.start).toBe("2025-03-15");
      });
    });
  });

  describe("timeline.end.date DatePicker", () => {
    it("writes the picked date to timeline.end.date", async () => {
      const { storage, fakeModalService } = mount({
        timeline: { start: "2024-01-01" as AnchorString, end: { kind: "date", date: "2024-06-01" as AnchorString } },
      });
      await userEvent.click(screen.getByText(m.journal_edit_section_timeline()));
      await userEvent.click(screen.getByRole("button", { name: "2024-06-01" }));
      fakeModalService.lastOpen<unknown, DayPeriod>().submit(DayPeriod.containing(date("2025-06-01")));
      await waitFor(() => {
        const config = storage.daily;
        expect(config?.timeline.end.kind === "date" ? config.timeline.end.date : null).toBe("2025-06-01");
      });
    });

    it("bounds the end-date picker to start when start is set", async () => {
      const { fakeModalService } = mount({
        timeline: { start: "2025-03-15" as AnchorString, end: { kind: "date", date: "2025-06-01" as AnchorString } },
      });
      await userEvent.click(screen.getByText(m.journal_edit_section_timeline()));
      await userEvent.click(screen.getByRole("button", { name: "2025-06-01" }));
      const handle = fakeModalService.lastOpen<{ bounds?: OpenInterval }, DayPeriod>();
      const boundsStart = handle.props.bounds?.start;
      expect(boundsStart?.isSome()).toBe(true);
      expect(boundsStart?.match({ some: (d) => d.toAnchor(), none: () => null })).toBe("2025-03-15");
    });
  });

  describe("repeats end mode", () => {
    it("warns to set a start date when ending after repeats with no start", async () => {
      mount({ timeline: { start: "" as AnchorString, end: { kind: "repeats", count: 3 } } });
      await userEvent.click(screen.getByText(m.journal_edit_section_timeline()));
      expect(screen.getByText(m.journal_edit_end_repeats_needs_start_warning())).toBeTruthy();
    });

    it("omits the start-date warning when a start date is set", async () => {
      mount({ timeline: { start: "2024-01-01" as AnchorString, end: { kind: "repeats", count: 3 } } });
      await userEvent.click(screen.getByText(m.journal_edit_section_timeline()));
      expect(screen.queryByText(m.journal_edit_end_repeats_needs_start_warning())).toBeNull();
    });
  });
});
