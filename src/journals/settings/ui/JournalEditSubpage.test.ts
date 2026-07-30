import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick } from "vue";

import { installTestCalendar } from "@/calendar/testing";
import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { InputSuggestService, NotesService, TemplaterService, NoticeService } from "@/infrastructure/host";
import { FakeInputSuggestService } from "@/infrastructure/host/input-suggests/testing";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNotesService, FakeTemplaterService, FakeNoticeService } from "@/infrastructure/host/testing";
import {
  CycleService,
  FrontmatterService,
  JournalsIndex,
  journalConfigCollection,
  NotePathService,
  NumberingService,
} from "@/journals";
import { AutoCreateService } from "@/journals/notes/auto-create";
import { JournalsRepository } from "@/journals/repository";
import { JournalsEventsToken } from "@/journals/tokens";
import { JournalsViewModel } from "@/journals/view-model";
import type { SubpageNav } from "@/settings";
import { createSettingsService } from "@/settings/testing";
import { TemplateEngine } from "@/templates";
import { installTestEngine } from "@/templates/testing";

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
  container.register(NoticeService).useValue(new FakeNoticeService());
  container.register(Flows).useClass(Flows);
  const flows = container.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  const journalsRepo = container.resolve(JournalsRepository);
  return { container, journalsRepo, flows, fakeModalService };
}

const noopNav: SubpageNav<{ journalName: string }> = {
  back: () => undefined,
  push: () => undefined,
  replace: () => undefined,
};

function mount(container: Container, journalName: string, nav: SubpageNav<{ journalName: string }> = noopNav) {
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

// The dashboard re-renders the subpage with the frame's replaced props; stand in for it.
function mountFollowingFrame(container: Container, journalName: string) {
  const back = vi.fn();
  const utilities = mount(container, journalName, {
    back,
    push: () => undefined,
    replace: (props) => void utilities.rerender(props),
  });
  return { back };
}

describe("JournalEditSubpage", () => {
  it("renders the journal name", async () => {
    const { container } = await setup({
      version: 4,
      journals: { work: makeJournal("work", { write: { type: "week" } }) },
    });
    mount(container, "work");
    expect(screen.getByText("work")).toBeTruthy();
  });

  it("renders the write frequency", async () => {
    const { container } = await setup({
      version: 4,
      journals: { work: makeJournal("work", { write: { type: "week" } }) },
    });
    mount(container, "work");
    expect(screen.getByText(m.journal_write({ type: "week", every: "day", duration: 1 }))).toBeTruthy();
  });

  it("calls nav.back when the back breadcrumb is clicked", async () => {
    const back = vi.fn();
    const { container } = await setup();
    mount(container, "daily", { back, push: () => undefined, replace: () => undefined });
    await userEvent.click(screen.getByRole("button", { name: m.common_label_back() }));
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
    const { container, journalsRepo } = await setup();
    mount(container, "daily", { back, push: () => undefined, replace: () => undefined });
    journalsRepo.delete("daily");
    await waitFor(() => {
      expect(back).toHaveBeenCalled();
    });
  });

  describe("when the journal is renamed", () => {
    it("keeps the journal's page open", async () => {
      const { container, journalsRepo } = await setup();
      const { back } = mountFollowingFrame(container, "daily");
      journalsRepo.rename("daily", "diary");
      await nextTick();
      await nextTick();
      expect(back).not.toHaveBeenCalled();
    });

    it("shows the journal's new name", async () => {
      const { container, journalsRepo } = await setup();
      mountFollowingFrame(container, "daily");
      journalsRepo.rename("daily", "diary");
      await waitFor(() => expect(screen.getByText("diary")).toBeTruthy());
    });
  });
});

describe("JournalEditSubpage collision warning", () => {
  it("names another journal that resolves to the same note path", async () => {
    const { container } = await setup({
      version: 4,
      journals: { daily: makeJournal("daily"), weekly: makeJournal("weekly") },
    });
    mount(container, "daily");
    expect(screen.getByText(m.journal_edit_colliding_warning({ names: "weekly" }))).toBeTruthy();
  });

  it("stays hidden when no other journal shares the resolved path", async () => {
    const { container } = await setup({
      version: 4,
      journals: { daily: makeJournal("daily"), weekly: makeJournal("weekly", { folder: "week" }) },
    });
    mount(container, "daily");
    expect(screen.queryByText(/resolves to the same note path as/)).toBeNull();
  });

  it("stays hidden when this is the only journal", async () => {
    const { container } = await setup();
    mount(container, "daily");
    expect(screen.queryByText(/resolves to the same note path as/)).toBeNull();
  });
});

function makeSectionComponent(label: string) {
  return defineComponent({
    props: { journalName: { type: String, default: "" } },
    render() {
      return h("div", label);
    },
  });
}

describe("JournalEditSubpage section ordering", () => {
  it("renders registered sections in ascending order", async () => {
    const { container } = await setup();
    container
      .register(JournalEditSectionToken)
      .useValue(defineJournalEditSection({ key: "b", order: 20, component: makeSectionComponent("B") }));
    container
      .register(JournalEditSectionToken)
      .useValue(defineJournalEditSection({ key: "a", order: 10, component: makeSectionComponent("A") }));
    mount(container, "daily");
    const a = screen.getByText("A");
    const b = screen.getByText("B");
    expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
