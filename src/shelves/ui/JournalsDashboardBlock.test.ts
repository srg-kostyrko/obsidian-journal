import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { AddJournalFlow, DeleteJournalFlow, journalConfigCollection, journalEditSubpage } from "@/journals";
import { JournalsRepository } from "@/journals/repository";
import { JournalsEventsToken } from "@/journals/tokens";
import { JournalsViewModel } from "@/journals/view-model";
import { SettingsUiService, SubpageToken } from "@/settings";
import { createSettingsService } from "@/settings/testing";

import { shelvesCollection } from "../config";
import { ShelvesRepository } from "../repository";
import { ShelvesEventsToken } from "../tokens";
import { ShelvesViewModel } from "../view-model";

import JournalsDashboardBlock from "./JournalsDashboardBlock.vue";

afterEach(() => cleanup());

function makeJournal(name: string) {
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
  };
}

async function setup(options: { journals?: string[]; shelves?: Record<string, { name: string; journals: string[] }> }) {
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection, shelvesCollection],
    raw: {
      version: 3,
      journals: Object.fromEntries((options.journals ?? []).map((n) => [n, makeJournal(n)])),
      shelves: options.shelves ?? {},
    },
  });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(JournalsEventsToken).useFactory(() => createNanoEvents());
  container.register(JournalsRepository).useClass(JournalsRepository);
  container.register(JournalsViewModel).useClass(JournalsViewModel);
  container.register(ShelvesEventsToken).useFactory(() => createNanoEvents());
  container.register(ShelvesRepository).useClass(ShelvesRepository);
  container.register(ShelvesViewModel).useClass(ShelvesViewModel);
  container.register(SubpageToken).useValue(journalEditSubpage);
  container.register(SettingsUiService).useClass(SettingsUiService);
  container.register(Flows).useClass(Flows);
  const flows = container.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  return { container, flows, ui: container.resolve(SettingsUiService) };
}

function mount(container: Container) {
  return render(JournalsDashboardBlock, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

describe("JournalsDashboardBlock", () => {
  it("lists only journals not on any shelf", async () => {
    const { container } = await setup({
      journals: ["daily", "weekly"],
      shelves: { Work: { name: "Work", journals: ["weekly"] } },
    });
    mount(container);
    expect(screen.getByLabelText(`${m.journal_dashboard_edit()} daily`)).toBeTruthy();
    expect(screen.queryByText("weekly")).toBeNull();
  });

  it("uses the plain title when no shelves exist", async () => {
    const { container } = await setup({ journals: ["daily"] });
    mount(container);
    expect(screen.getByText(m.shelf_journals_block_title())).toBeTruthy();
  });

  it("uses the not-on-a-shelf title once a shelf exists", async () => {
    const { container } = await setup({
      journals: ["daily"],
      shelves: { Work: { name: "Work", journals: [] } },
    });
    mount(container);
    expect(screen.getByText(m.shelf_journals_block_title_filtered())).toBeTruthy();
  });

  it("invokes AddJournalFlow when the add button is clicked", async () => {
    const { container, flows } = await setup({});
    mount(container);
    await userEvent.click(screen.getByLabelText(m.journal_dashboard_add()));
    expect(flows.invoke).toHaveBeenCalledWith(AddJournalFlow);
  });

  it("pushes the journal-edit subpage when Edit is clicked", async () => {
    const { container, ui } = await setup({ journals: ["daily"] });
    mount(container);
    await userEvent.click(screen.getByLabelText(`${m.journal_dashboard_edit()} daily`));
    expect(ui.current.value?.subpage.key).toBe("journal-edit");
    expect(ui.current.value?.props).toEqual({ journalName: "daily" });
  });

  it("invokes DeleteJournalFlow when Delete is clicked", async () => {
    const { container, flows } = await setup({ journals: ["daily"] });
    mount(container);
    await userEvent.click(screen.getByLabelText(`${m.journal_dashboard_delete()} daily`));
    expect(flows.invoke).toHaveBeenCalledWith(DeleteJournalFlow, { journalName: "daily" });
  });
});
