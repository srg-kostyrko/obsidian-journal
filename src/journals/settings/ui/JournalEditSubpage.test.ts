import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor, within } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DayPeriod, type OpenInterval } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";
import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { InputSuggestService, NotesService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNotesService } from "@/infrastructure/host/testing";
import {
  CycleService,
  FrontmatterService,
  JournalsIndex,
  journalConfigCollection,
  NotePathService,
  NumberingService,
} from "@/journals";
import { createSettingsService } from "@/settings/testing";
import { TemplateEngine } from "@/templates";
import { installTestEngine } from "@/templates/testing";

import { EditFrontmatterFieldFlow } from "../flows/edit-frontmatter-field.flow";
import { EditSequencePropertyFlow } from "../flows/edit-sequence-property.flow";
import { RenameJournalFlow } from "../flows/rename-journal.flow";

import JournalEditSubpage from "./JournalEditSubpage.vue";

let teardown: () => void;
beforeEach(() => {
  ({ teardown } = installTestCalendar());
});
afterEach(() => {
  teardown();
  cleanup();
});

function makeJournal(name: string, overrides: Partial<Record<string, unknown>> = {}) {
  return {
    name,
    write: { type: "day" as const },
    timeline: { start: "2024-01-01", end: { kind: "never" as const } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: {
      dateField: "journal-date",
      startDateField: "journal-start-date",
      endDateField: "journal-end-date",
      addStartDate: false,
      addEndDate: false,
    },
    numbering: { enabled: false, anchorDate: "2024-01-01", allowBefore: false, sources: [] },
    nameTemplate: "{{date}}",
    folder: "",
    templates: [],
    confirmCreation: false,
    autoCreate: false,
    ...overrides,
  };
}

async function setup(raw?: unknown) {
  const initial = raw ?? {
    version: 3,
    journals: { daily: makeJournal("daily") },
  };
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection],
    raw: initial,
  });
  await settings.initialize();
  container.register(TemplateEngine).useValue(installTestEngine());
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(CycleService).useClass(CycleService);
  container.register(NumberingService).useClass(NumberingService);
  container.register(FrontmatterService).useClass(FrontmatterService);
  container.register(NotePathService).useClass(NotePathService);
  const fakeModalService = new FakeModalService();
  container.register(ModalService).useValue(fakeModalService as unknown as ModalService);
  container.register(InputSuggestService).useValue(new FakeInputSuggestService() as unknown as InputSuggestService);
  container.register(NotesService).useValue(new FakeNotesService() as unknown as NotesService);
  container.register(Flows).useClass(Flows);
  const flows = container.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  return { container, settings, flows, fakeModalService };
}

const noopNav = { back: () => undefined, push: () => undefined };

function mount(container: Container, journalName: string, nav: { back: () => void; push: () => void } = noopNav) {
  return render(JournalEditSubpage, {
    props: { journalName, nav },
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

describe("JournalEditSubpage", () => {
  it("renders the header with name and write description", async () => {
    const { container } = await setup();
    mount(container, "daily");
    expect(
      screen.getByText(
        m.journal_edit_header_title({
          name: "daily",
          writing: m.journal_write({ type: "day", every: "day", duration: 1 }),
        }),
      ),
    ).toBeTruthy();
  });

  it("calls nav.back when the back button is clicked", async () => {
    const back = vi.fn();
    const { container } = await setup();
    mount(container, "daily", { back, push: () => undefined });
    await userEvent.click(screen.getByLabelText(m.journal_edit_back_tooltip()));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("invokes RenameJournalFlow when the rename pencil is clicked", async () => {
    const { container, flows } = await setup();
    mount(container, "daily");
    await userEvent.click(screen.getByLabelText(m.journal_edit_rename_tooltip()));
    expect(flows.invoke).toHaveBeenCalledWith(RenameJournalFlow, { journalName: "daily" });
  });

  it("calls nav.back when the underlying journal disappears", async () => {
    const back = vi.fn();
    const { container, settings } = await setup();
    mount(container, "daily", { back, push: () => undefined });
    settings.getCollection(journalConfigCollection).remove("daily");
    await waitFor(() => {
      expect(back).toHaveBeenCalled();
    });
  });

  it("persists changes to dateFormat through the reactive collection", async () => {
    const { container, settings } = await setup();
    mount(container, "daily");
    const inputs = screen.getAllByRole("textbox");
    const dateFormatInput = inputs.find((element) => (element as HTMLInputElement).value === "YYYY-MM-DD");
    if (!dateFormatInput) throw new Error("dateFormat input not found");
    await userEvent.clear(dateFormatInput);
    await userEvent.type(dateFormatInput, "YYYY/MM");
    expect(settings.getCollection(journalConfigCollection).get("daily")?.dateFormat).toBe("YYYY/MM");
  });

  it("materializes the default source when sequential numbers is toggled on", async () => {
    const { container, settings } = await setup();
    mount(container, "daily");
    await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));
    const sequenceEnabledRow = screen.getByText(m.journal_edit_sequence_enabled_label()).closest(".setting-item");
    if (!sequenceEnabledRow) throw new Error("sequence-enabled row not found");
    const sequenceToggle = within(sequenceEnabledRow as HTMLElement).getByRole("checkbox");
    await userEvent.click(sequenceToggle);
    const config = settings.getCollection(journalConfigCollection).get("daily")!;
    expect(config.numbering.enabled).toBe(true);
    expect(config.numbering.sources[0]).toEqual({
      variable: "index",
      frontmatterKey: "journal-index",
      anchorValue: 1,
      reset: { kind: "never" },
    });
  });

  it("hides the allow-before toggle when start date is set", async () => {
    const initial = {
      version: 3,
      journals: {
        daily: makeJournal("daily", {
          timeline: { start: "2024-01-01", end: { kind: "never" } },
          numbering: {
            enabled: true,
            anchorDate: "2024-01-01",
            allowBefore: false,
            sources: [
              {
                variable: "index",
                frontmatterKey: "journal-index",
                anchorValue: 1,
                reset: { kind: "never" },
              },
            ],
          },
        }),
      },
    };
    const { container } = await setup(initial);
    mount(container, "daily");
    await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));
    expect(screen.queryByText(m.journal_edit_allow_before_label())).toBeNull();
  });

  it("invokes EditFrontmatterFieldFlow when the date-field pencil is clicked", async () => {
    const { container, flows } = await setup();
    mount(container, "daily");
    await userEvent.click(screen.getByText(m.journal_edit_section_frontmatter()));
    await userEvent.click(screen.getByLabelText(`${m.journal_fm_field_label({ field: "dateField" })} edit`));
    expect(flows.invoke).toHaveBeenCalledWith(EditFrontmatterFieldFlow, {
      journalName: "daily",
      fieldName: "dateField",
    });
  });

  it("invokes EditSequencePropertyFlow when the sequence property pencil is clicked", async () => {
    const initial = {
      version: 3,
      journals: {
        daily: makeJournal("daily", {
          numbering: {
            enabled: true,
            anchorDate: "2024-01-01",
            allowBefore: false,
            sources: [
              {
                variable: "index",
                frontmatterKey: "journal-index",
                anchorValue: 1,
                reset: { kind: "never" },
              },
            ],
          },
        }),
      },
    };
    const { container, flows } = await setup(initial);
    mount(container, "daily");
    await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));
    await userEvent.click(screen.getByLabelText(`${m.journal_edit_sequence_property_label()} edit`));
    expect(flows.invoke).toHaveBeenCalledWith(EditSequencePropertyFlow, {
      journalName: "daily",
      sourceIndex: 0,
    });
  });

  describe("timeline.start DatePicker", () => {
    it("writes the picked date to timeline.start", async () => {
      const { container, settings, fakeModalService } = await setup();
      mount(container, "daily");
      await userEvent.click(screen.getByRole("button", { name: "2024-01-01" }));
      fakeModalService.lastOpen<unknown, DayPeriod>().submit(DayPeriod.containing(date("2025-03-15")));
      await waitFor(() => {
        expect(settings.getCollection(journalConfigCollection).get("daily")?.timeline.start).toBe("2025-03-15");
      });
    });
  });

  describe("timeline.end.date DatePicker", () => {
    it("writes the picked date to timeline.end.date", async () => {
      const initial = {
        version: 3,
        journals: {
          daily: makeJournal("daily", { timeline: { start: "2024-01-01", end: { kind: "date", date: "2024-06-01" } } }),
        },
      };
      const { container, settings, fakeModalService } = await setup(initial);
      mount(container, "daily");
      await userEvent.click(screen.getByRole("button", { name: "2024-06-01" }));
      fakeModalService.lastOpen<unknown, DayPeriod>().submit(DayPeriod.containing(date("2025-06-01")));
      await waitFor(() => {
        const config = settings.getCollection(journalConfigCollection).get("daily")!;
        expect(config.timeline.end.kind === "date" ? config.timeline.end.date : null).toBe("2025-06-01");
      });
    });

    it("bounds the end-date picker to start when start is set", async () => {
      const initial = {
        version: 3,
        journals: {
          daily: makeJournal("daily", {
            timeline: { start: "2025-03-15", end: { kind: "date", date: "2025-06-01" } },
          }),
        },
      };
      const { container, fakeModalService } = await setup(initial);
      mount(container, "daily");
      await userEvent.click(screen.getByRole("button", { name: "2025-06-01" }));
      const handle = fakeModalService.lastOpen<{ bounds?: OpenInterval }, DayPeriod>();
      const boundsStart = handle.props.bounds?.start;
      expect(boundsStart?.isSome()).toBe(true);
      expect(boundsStart?.match({ some: (d) => d.toAnchor(), none: () => null })).toBe("2025-03-15");
    });
  });

  describe("numbering anchor DatePicker", () => {
    it("writes the picked date to numbering.anchorDate", async () => {
      const initial = {
        version: 3,
        journals: {
          daily: makeJournal("daily", {
            timeline: { start: "2024-01-01", end: { kind: "never" } },
            numbering: {
              enabled: true,
              anchorDate: "2024-01-01",
              allowBefore: false,
              sources: [
                {
                  variable: "index",
                  frontmatterKey: "journal-index",
                  anchorValue: 1,
                  reset: { kind: "never" },
                },
              ],
            },
          }),
        },
      };
      const { container, settings, fakeModalService } = await setup(initial);
      mount(container, "daily");
      // Clear start so the numbering anchor picker becomes visible
      await userEvent.click(screen.getByLabelText(m.common_action_close()));
      await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));
      await userEvent.click(screen.getByRole("button", { name: "2024-01-01" }));
      fakeModalService.lastOpen<unknown, DayPeriod>().submit(DayPeriod.containing(date("2025-01-10")));
      await waitFor(() => {
        expect(settings.getCollection(journalConfigCollection).get("daily")?.numbering.anchorDate).toBe("2025-01-10");
      });
    });
  });

  describe("note creation collapsible", () => {
    it("renders the four fields", async () => {
      const { container } = await setup();
      mount(container, "daily");
      expect(screen.getByText(m.journal_edit_section_note_creation())).toBeTruthy();
      expect(screen.getByText(m.journal_edit_name_template_label())).toBeTruthy();
      expect(screen.getByText(m.journal_edit_folder_label())).toBeTruthy();
      expect(screen.getByText(m.journal_edit_confirm_creation_label())).toBeTruthy();
      expect(screen.getByText(m.journal_edit_auto_create_label())).toBeTruthy();
    });

    it("persists nameTemplate edits through the reactive collection", async () => {
      const { container, settings } = await setup();
      mount(container, "daily");
      const nameTemplateRow = screen.getByText(m.journal_edit_name_template_label()).closest(".setting-item");
      if (!nameTemplateRow) throw new Error("name-template row not found");
      const nameTemplateInput = within(nameTemplateRow as HTMLElement).getByRole("textbox");
      await userEvent.clear(nameTemplateInput);
      await userEvent.type(nameTemplateInput, "daily-note");
      expect(settings.getCollection(journalConfigCollection).get("daily")?.nameTemplate).toBe("daily-note");
    });

    it("auto-create description mentions confirmation skip only when confirmCreation is on", async () => {
      const { container, settings } = await setup();
      mount(container, "daily");
      expect(screen.queryByText(m.journal_edit_auto_create_confirmation_skip_note())).toBeNull();
      const config = settings.getCollection(journalConfigCollection).get("daily")!;
      config.confirmCreation = true;
      await waitFor(() => {
        expect(screen.getByText(m.journal_edit_auto_create_confirmation_skip_note())).toBeTruthy();
      });
    });

    it("shows the invertibility warning for non-invertible name templates", async () => {
      const initial = {
        version: 3,
        journals: { daily: makeJournal("daily", { nameTemplate: "{{date}}-{{mystery}}" }) },
      };
      const { container } = await setup(initial);
      mount(container, "daily");
      expect(
        screen.getByText(
          m.journal_edit_name_template_invertibility_warning({
            reason: "unknown-variable",
            offending: "mystery",
          }),
        ),
      ).toBeTruthy();
    });

    it("shows the move-to-folder recommendation when nameTemplate contains /", async () => {
      const initial = {
        version: 3,
        journals: { daily: makeJournal("daily", { nameTemplate: "year/{{date}}" }) },
      };
      const { container } = await setup(initial);
      mount(container, "daily");
      expect(screen.getByText(m.journal_edit_move_to_folder_recommendation_name_template())).toBeTruthy();
    });

    it("apply-recommendation moves the path prefix from nameTemplate to folder", async () => {
      const initial = {
        version: 3,
        journals: { daily: makeJournal("daily", { nameTemplate: "year/{{date}}", folder: "" }) },
      };
      const { container, settings } = await setup(initial);
      mount(container, "daily");
      const link = screen.getByRole("link", { name: m.journal_edit_move_to_folder_apply_link() });
      await userEvent.click(link);
      const config = settings.getCollection(journalConfigCollection).get("daily");
      if (!config) throw new Error("daily journal disappeared");
      expect(config.folder).toBe("year");
      expect(config.nameTemplate).toBe("{{date}}");
    });
  });

  it("shows the move-to-folder recommendation when dateFormat contains /", async () => {
    const initial = {
      version: 3,
      journals: { daily: makeJournal("daily", { dateFormat: "YYYY/MM/DD" }) },
    };
    const { container } = await setup(initial);
    mount(container, "daily");
    expect(screen.getByText(m.journal_edit_move_to_folder_recommendation_date_format())).toBeTruthy();
  });

  it("apply-recommendation moves the path prefix from dateFormat to folder", async () => {
    const initial = {
      version: 3,
      journals: { daily: makeJournal("daily", { dateFormat: "YYYY/MM/DD", folder: "" }) },
    };
    const { container, settings } = await setup(initial);
    mount(container, "daily");
    const link = screen.getByRole("link", { name: m.journal_edit_move_to_folder_apply_link() });
    await userEvent.click(link);
    const config = settings.getCollection(journalConfigCollection).get("daily");
    if (!config) throw new Error("daily journal disappeared");
    expect(config.folder).toBe("{{date:YYYY}}/{{date:MM}}");
    expect(config.dateFormat).toBe("DD");
  });
});
