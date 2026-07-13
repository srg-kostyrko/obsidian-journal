import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

import { installTestCalendar } from "@/calendar/testing";
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

import { EditFrontmatterFieldFlow } from "../../flows/edit-frontmatter-field.flow";

import FrontmatterSection from "./FrontmatterSection.vue";

let teardown: () => void;
beforeEach(() => {
  ({ teardown } = installTestCalendar());
});
afterEach(() => {
  teardown();
  cleanup();
});

function mount(overrides: Partial<JournalConfig> = {}) {
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
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container
    .register(AutoCreateService)
    .useValue({ createCurrent: () => Promise.resolve() } as unknown as AutoCreateService);
  container.register(Flows).useClass(Flows);
  const flows = container.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  render(FrontmatterSection, {
    props: { journalName: "daily" },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
  return { storage, repo, flows };
}

describe("FrontmatterSection", () => {
  describe("date field pencil", () => {
    it("invokes EditFrontmatterFieldFlow when the date-field pencil is clicked", async () => {
      const { flows } = mount();
      await userEvent.click(screen.getByText(m.journal_edit_section_frontmatter()));
      await userEvent.click(screen.getByLabelText(m.journal_fm_field_modal_title({ field: "dateField" })));
      expect(flows.invoke).toHaveBeenCalledWith(EditFrontmatterFieldFlow, {
        journalName: "daily",
        fieldName: "dateField",
      });
    });
  });

  describe("start date field", () => {
    it("hides the start-date field row when addStartDate is off", async () => {
      mount({
        frontmatter: {
          dateField: "journal-date",
          startDateField: "journal-start-date",
          endDateField: "journal-end-date",
          addStartDate: false,
          addEndDate: false,
        },
      });
      await userEvent.click(screen.getByText(m.journal_edit_section_frontmatter()));
      expect(screen.queryByText(m.journal_fm_field_label({ field: "startDateField" }))).toBeNull();
    });

    it("shows the start-date field row when addStartDate is on", async () => {
      mount({
        frontmatter: {
          dateField: "journal-date",
          startDateField: "journal-start-date",
          endDateField: "journal-end-date",
          addStartDate: true,
          addEndDate: false,
        },
      });
      await userEvent.click(screen.getByText(m.journal_edit_section_frontmatter()));
      expect(screen.queryByText(m.journal_fm_field_label({ field: "startDateField" }))).not.toBeNull();
    });
  });

  describe("end date field", () => {
    it("hides the end-date field row when addEndDate is off", async () => {
      mount({
        frontmatter: {
          dateField: "journal-date",
          startDateField: "journal-start-date",
          endDateField: "journal-end-date",
          addStartDate: false,
          addEndDate: false,
        },
      });
      await userEvent.click(screen.getByText(m.journal_edit_section_frontmatter()));
      expect(screen.queryByText(m.journal_fm_field_label({ field: "endDateField" }))).toBeNull();
    });

    it("shows the end-date field row when addEndDate is on", async () => {
      mount({
        frontmatter: {
          dateField: "journal-date",
          startDateField: "journal-start-date",
          endDateField: "journal-end-date",
          addStartDate: false,
          addEndDate: true,
        },
      });
      await userEvent.click(screen.getByText(m.journal_edit_section_frontmatter()));
      expect(screen.queryByText(m.journal_fm_field_label({ field: "endDateField" }))).not.toBeNull();
    });
  });
});
