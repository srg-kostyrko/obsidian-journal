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
import { JournalsEventsToken } from "@/journals/tokens";
import { TemplateEngine } from "@/templates";
import { installTestEngine } from "@/templates/testing";

import TemplatesSection from "./TemplatesSection.vue";

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
  render(TemplatesSection, {
    props: { journalName: "daily" },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
  return { storage, repo };
}

describe("TemplatesSection", () => {
  describe("section heading", () => {
    it("renders the section heading with the template count", () => {
      mount({ templates: ["a.md", "b.md"] });
      expect(screen.getByText(m.journal_edit_section_templates())).toBeTruthy();
      expect(screen.getByText("2")).toBeTruthy();
    });
  });

  describe("adding a template", () => {
    it("appends an empty entry when Add template is clicked", async () => {
      const { storage } = mount({ templates: [] });
      await userEvent.click(screen.getByText(m.journal_edit_template_add_button()));
      expect(storage.daily?.templates).toEqual([""]);
    });
  });

  describe("removing a template", () => {
    it("removes an entry when its trash button is clicked", async () => {
      const { storage } = mount({ templates: ["a.md"] });
      await userEvent.click(screen.getByText(m.journal_edit_section_templates()));
      await userEvent.click(screen.getByLabelText(m.journal_edit_template_remove_tooltip()));
      expect(storage.daily?.templates).toEqual([]);
    });
  });

  describe("template path preview", () => {
    it("renders the path preview only when the path contains a variable", async () => {
      mount({ templates: ["{{date:YYYY}}-template.md", "static-template.md"] });
      await userEvent.click(screen.getByText(m.journal_edit_section_templates()));
      await waitFor(() => {
        expect(screen.getByText("2026-template.md")).toBeTruthy();
      });
      expect(screen.queryByText("static-template.md", { exact: false, selector: "b.u-pop" })).toBeNull();
    });
  });
});
