import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reactive } from "vue";

import { installTestCalendar } from "@/calendar/testing";
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

import NoteCreationSection from "./NoteCreationSection.vue";

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
  render(NoteCreationSection, {
    props: { journalName: "daily" },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
  return { storage, repo };
}

describe("NoteCreationSection", () => {
  describe("section heading", () => {
    it("renders all five setting rows", () => {
      mount();
      expect(screen.getByText(m.journal_edit_section_note_creation())).toBeTruthy();
      expect(screen.getByText(m.journal_edit_name_template_label())).toBeTruthy();
      expect(screen.getByText(m.journal_edit_folder_label())).toBeTruthy();
      expect(screen.getByText(m.journal_edit_date_format_label())).toBeTruthy();
      expect(screen.getByText(m.journal_edit_confirm_creation_label())).toBeTruthy();
      expect(screen.getByText(m.journal_edit_auto_create_label())).toBeTruthy();
    });
  });

  describe("nameTemplate field", () => {
    it("persists edits to the journal config", async () => {
      const { storage } = mount();
      const input = screen.getByDisplayValue("{{date}}");
      await userEvent.clear(input);
      await userEvent.type(input, "daily-note");
      expect(storage.daily?.nameTemplate).toBe("daily-note");
    });

    it("shows the invertibility warning for non-invertible templates", () => {
      mount({ nameTemplate: "{{date}}-{{mystery}}" });
      expect(
        screen.getByText(
          m.journal_edit_name_template_invertibility_warning({
            reason: "unknown-variable",
            offending: "mystery",
          }),
        ),
      ).toBeTruthy();
    });

    it("shows the move-to-folder recommendation when nameTemplate contains a slash", () => {
      mount({ nameTemplate: "year/{{date}}" });
      expect(screen.getByText(m.journal_edit_move_to_folder_recommendation_name_template())).toBeTruthy();
    });

    it("moves the path prefix from nameTemplate to folder when the recommendation is applied", async () => {
      const { storage } = mount({ nameTemplate: "year/{{date}}", folder: "" });
      await userEvent.click(screen.getByRole("link", { name: m.journal_edit_move_to_folder_apply_link() }));
      expect(storage.daily?.folder).toBe("year");
      expect(storage.daily?.nameTemplate).toBe("{{date}}");
    });

    it("live-renders the note name preview as nameTemplate changes", async () => {
      const { storage } = mount();
      const input = screen.getByDisplayValue("{{date}}");
      await userEvent.clear(input);
      await userEvent.type(input, "note-prefix");
      await waitFor(() => {
        expect(storage.daily?.nameTemplate).toBe("note-prefix");
      });
      await waitFor(() => {
        expect(screen.getByText("note-prefix")).toBeTruthy();
      });
    });
  });

  describe("dateFormat field", () => {
    it("persists edits to the journal config", async () => {
      const { storage } = mount();
      const input = screen.getByDisplayValue("YYYY-MM-DD");
      await userEvent.clear(input);
      await userEvent.type(input, "YYYY/MM");
      expect(storage.daily?.dateFormat).toBe("YYYY/MM");
    });

    it("shows the move-to-folder recommendation when dateFormat contains a slash", () => {
      mount({ dateFormat: "YYYY/MM/DD" });
      expect(screen.getByText(m.journal_edit_move_to_folder_recommendation_date_format())).toBeTruthy();
    });

    it("moves the path prefix from dateFormat to folder when the recommendation is applied", async () => {
      const { storage } = mount({ dateFormat: "YYYY/MM/DD", folder: "" });
      await userEvent.click(screen.getByRole("link", { name: m.journal_edit_move_to_folder_apply_link() }));
      expect(storage.daily?.folder).toBe("{{date:YYYY}}/{{date:MM}}");
      expect(storage.daily?.dateFormat).toBe("DD");
    });
  });

  describe("autoCreate field", () => {
    it("shows the confirmation-skip note only when confirmCreation is enabled", async () => {
      const { repo } = mount();
      expect(screen.queryByText(m.journal_edit_auto_create_confirmation_skip_note())).toBeNull();
      repo.update("daily", { confirmCreation: true });
      await waitFor(() => {
        expect(screen.getByText(m.journal_edit_auto_create_confirmation_skip_note())).toBeTruthy();
      });
    });
  });
});
