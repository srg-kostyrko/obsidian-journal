import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor, within } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";

import { DayPeriod } from "@/calendar";
import { date, installTestCalendar } from "@/calendar/testing";
import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { InputSuggestService, NotesService, TemplaterService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNotesService, FakeTemplaterService } from "@/infrastructure/host/testing";
import {
  CycleService,
  FrontmatterService,
  JournalsIndex,
  journalConfigCollection,
  NotePathService,
  NumberingService,
} from "@/journals";
import { AutoCreateService } from "@/journals/notes/auto-create";
import { BulkAddFlow } from "@/journals/notes/bulk-add/flows/bulk-add.flow";
import { JournalsRepository } from "@/journals/repository";
import { unwrap } from "@/journals/testing";
import { JournalsEventsToken } from "@/journals/tokens";
import { JournalsViewModel } from "@/journals/view-model";
import { createSettingsService } from "@/settings/testing";
import { TemplateEngine } from "@/templates";
import { installTestEngine } from "@/templates/testing";

import { EditFrontmatterFieldFlow } from "../flows/edit-frontmatter-field.flow";
import { EditSequencePropertyFlow } from "../flows/edit-sequence-property.flow";
import { RenameJournalFlow } from "../flows/rename-journal.flow";

import { JournalEditSectionToken, defineJournalEditSection } from "./journal-edit-section";
import JournalEditSubpage from "./JournalEditSubpage.vue";

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
    version: 4,
    journals: { daily: makeJournal("daily") },
  };
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection],
    raw: initial,
  });
  await settings.initialize();
  container.register(TemplateEngine).useValue(installTestEngine());
  container.register(JournalsEventsToken).useFactory(() => createNanoEvents());
  container.register(JournalsRepository).useClass(JournalsRepository);
  container.register(JournalsViewModel).useClass(JournalsViewModel);
  container.register(JournalsIndex).useClass(JournalsIndex);
  container.register(CycleService).useClass(CycleService);
  container.register(NumberingService).useClass(NumberingService);
  container.register(FrontmatterService).useClass(FrontmatterService);
  container.register(NotePathService).useClass(NotePathService);
  const fakeModalService = new FakeModalService();
  container.register(ModalService).useValue(fakeModalService as unknown as ModalService);
  container.register(TemplaterService).useValue(new FakeTemplaterService() as unknown as TemplaterService);
  container.register(InputSuggestService).useValue(new FakeInputSuggestService() as unknown as InputSuggestService);
  container.register(NotesService).useValue(new FakeNotesService() as unknown as NotesService);
  container
    .register(AutoCreateService)
    .useValue({ createCurrent: () => Promise.resolve() } as unknown as AutoCreateService);
  container.register(Flows).useClass(Flows);
  const flows = container.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  const journalsRepo = container.resolve(JournalsRepository);
  return { container, journalsRepo, flows, fakeModalService };
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

  it("invokes BulkAddFlow when the bulk-add button is clicked", async () => {
    const { container, flows } = await setup();
    mount(container, "daily");
    await userEvent.click(screen.getByText(m.bulk_add_command()));
    expect(flows.invoke).toHaveBeenCalledWith(BulkAddFlow, { journalName: "daily" });
  });

  it("calls nav.back when the underlying journal disappears", async () => {
    const back = vi.fn();
    const { container, journalsRepo } = await setup();
    mount(container, "daily", { back, push: () => undefined });
    journalsRepo.delete("daily");
    await waitFor(() => {
      expect(back).toHaveBeenCalled();
    });
  });

  it("materializes the default source when sequential numbers is toggled on", async () => {
    const { container, journalsRepo } = await setup();
    mount(container, "daily");
    await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));
    const sequenceEnabledRow = screen.getByText(m.journal_edit_sequence_enabled_label()).closest(".setting-item");
    if (!sequenceEnabledRow) throw new Error("sequence-enabled row not found");
    const sequenceToggle = within(sequenceEnabledRow as HTMLElement).getByRole("checkbox");
    await userEvent.click(sequenceToggle);
    const config = unwrap(journalsRepo.get("daily"));
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
      version: 4,
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
      version: 4,
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
    await userEvent.click(screen.getByLabelText(`${m.common_label_property_name()} edit`));
    expect(flows.invoke).toHaveBeenCalledWith(EditSequencePropertyFlow, {
      journalName: "daily",
      sourceIndex: 0,
    });
  });

  describe("numbering anchor DatePicker", () => {
    it("writes the picked date to numbering.anchorDate", async () => {
      const initial = {
        version: 4,
        journals: {
          daily: makeJournal("daily", {
            timeline: { start: "", end: { kind: "never" } },
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
      const { container, journalsRepo, fakeModalService } = await setup(initial);
      mount(container, "daily");
      await userEvent.click(screen.getByText(m.journal_edit_section_sequential_numbers()));
      await userEvent.click(screen.getByRole("button", { name: "2024-01-01" }));
      fakeModalService.lastOpen<unknown, DayPeriod>().submit(DayPeriod.containing(date("2025-01-10")));
      await waitFor(() => {
        expect(unwrap(journalsRepo.get("daily")).numbering.anchorDate).toBe("2025-01-10");
      });
    });
  });
});

describe("JournalEditSubpage extension sections", () => {
  it("renders sections contributed through JournalEditSectionToken", async () => {
    const { container } = await setup();
    const Stub = defineComponent({
      props: { journalName: { type: String, required: true } },
      setup: (props) => () => h("div", `section for ${props.journalName}`),
    });
    container
      .register(JournalEditSectionToken)
      .useValue(defineJournalEditSection({ key: "stub", component: Stub, order: 1 }));
    mount(container, "daily");
    expect(screen.getByText("section for daily")).toBeTruthy();
  });
});
