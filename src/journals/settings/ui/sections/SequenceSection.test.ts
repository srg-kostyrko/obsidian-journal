import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

import { Calendar, DayPeriod, type AnchorString } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";
import { m } from "@/i18n";
import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { InputSuggestService, NotesService, TemplaterService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNotesService, FakeTemplaterService } from "@/infrastructure/host/testing";
import { createLoggerTestingModule } from "@/infrastructure/logger/testing";
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

import { EditSequencePropertyFlow } from "../../flows/edit-sequence-property.flow";

import SequenceSection from "./SequenceSection.vue";

let teardown: () => void;
beforeEach(() => {
  ({ teardown } = installTestCalendar());
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-05-19T12:00:00"));
});
afterEach(() => {
  vi.useRealTimers();
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
  container.addModule(createLoggerTestingModule().module);
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
  container.register(Flows).useClass(Flows);
  const flows = container.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  render(SequenceSection, {
    props: { journalName: "daily" },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
  return { storage, repo, flows, fakeModalService };
}

describe("SequenceSection", () => {
  describe("section heading", () => {
    it("renders the sequential numbers heading", () => {
      mount();
      expect(screen.getByText(m.journal_edit_section_sequential_numbers())).toBeTruthy();
    });
  });

  describe("sequence toggle", () => {
    it("materializes the default source when sequential numbers is toggled on", async () => {
      const { storage } = mount({
        numbering: { enabled: false, anchorDate: "2024-01-01" as AnchorString, allowBefore: false, sources: [] },
      });
      await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));
      await userEvent.click(screen.getByRole("checkbox"));
      expect(storage.daily?.numbering.sources).toHaveLength(1);
      expect(storage.daily?.numbering.enabled).toBe(true);
    });
  });

  describe("allow-before toggle", () => {
    it("hides the allow-before toggle when start date is set", async () => {
      mount({
        timeline: { start: "2024-01-01" as AnchorString, end: { kind: "never" } },
        numbering: {
          enabled: true,
          anchorDate: "2024-01-01" as AnchorString,
          allowBefore: false,
          sources: [{ variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } }],
        },
      });
      await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));
      expect(screen.queryByText(m.journal_edit_allow_before_label())).toBeNull();
    });
  });

  describe("sequence property pencil", () => {
    it("invokes EditSequencePropertyFlow when the sequence property pencil is clicked", async () => {
      const { flows } = mount({
        numbering: {
          enabled: true,
          anchorDate: "2024-01-01" as AnchorString,
          allowBefore: false,
          sources: [{ variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } }],
        },
      });
      await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));
      await userEvent.click(screen.getByLabelText(`${m.common_label_property_name()} edit`));
      expect(flows.invoke).toHaveBeenCalledWith(EditSequencePropertyFlow, { journalName: "daily", sourceIndex: 0 });
    });
  });

  describe("numbering anchor DatePicker", () => {
    it("writes the picked date to numbering.anchorDate", async () => {
      const { storage, fakeModalService } = mount({
        timeline: { start: "" as AnchorString, end: { kind: "never" } },
        numbering: {
          enabled: true,
          anchorDate: "2024-01-01" as AnchorString,
          allowBefore: false,
          sources: [{ variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } }],
        },
      });
      await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));
      await userEvent.click(screen.getByRole("button", { name: "2024-01-01" }));
      fakeModalService.lastOpen<unknown, DayPeriod>().submit(DayPeriod.containing(date("2025-01-10")));
      await waitFor(() => {
        expect(storage.daily?.numbering.anchorDate).toBe("2025-01-10");
      });
    });
  });
});
