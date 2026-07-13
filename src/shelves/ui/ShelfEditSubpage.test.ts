import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { AsyncResult } from "@/infrastructure/result";
import { AddJournalFlow, journalConfigCollection } from "@/journals";
import { BulkAddFlow } from "@/journals/notes/bulk-add/flows/bulk-add.flow";
import { JournalsRepository } from "@/journals/repository";
import { JournalsEventsToken } from "@/journals/tokens";
import { JournalsViewModel } from "@/journals/view-model";
import { SettingsUiService, SubpageToken } from "@/settings";
import { createSettingsService } from "@/settings/testing";

import { shelvesCollection } from "../config";
import { EditShelfNameFlow } from "../flows/edit-shelf-name.flow";
import { ShelvesRepository } from "../repository";
import { ShelvesService } from "../service";
import { ShelvesEventsToken } from "../tokens";
import { ShelvesViewModel } from "../view-model";

import { shelfEditSubpage } from "./shelf-edit-subpage";
import ShelfEditSubpage from "./ShelfEditSubpage.vue";

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
  const raw = {
    version: 4,
    journals: Object.fromEntries((options.journals ?? []).map((n) => [n, makeJournal(n)])),
    shelves: options.shelves ?? {},
  };
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection, shelvesCollection],
    raw,
  });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(JournalsEventsToken).useFactory(() => createNanoEvents());
  container.register(JournalsRepository).useClass(JournalsRepository);
  container.register(JournalsViewModel).useClass(JournalsViewModel);
  container.register(ShelvesEventsToken).useFactory(() => createNanoEvents());
  container.register(ShelvesRepository).useClass(ShelvesRepository);
  container.register(ShelvesService).useClass(ShelvesService);
  container.register(ShelvesViewModel).useClass(ShelvesViewModel);
  container.register(SubpageToken).useValue(shelfEditSubpage);
  container.register(SettingsUiService).useClass(SettingsUiService);
  container.register(Flows).useClass(Flows);
  const flows = container.resolve(Flows);
  const shelvesRepo = container.resolve(ShelvesRepository);
  return { container, shelvesRepo, flows };
}

const noopNav = { back: () => undefined, push: () => undefined };

function mount(container: Container, shelfName: string, nav = noopNav) {
  return render(ShelfEditSubpage, {
    props: { shelfName, nav },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

describe("ShelfEditSubpage", () => {
  it("lists the shelf's member journals", async () => {
    const { container } = await setup({
      journals: ["daily"],
      shelves: { Work: { name: "Work", journals: ["daily"] } },
    });
    mount(container, "Work");
    expect(screen.getByLabelText(m.journal_dashboard_edit({ name: "daily" }))).toBeTruthy();
  });

  it("invokes BulkAddFlow when a member journal's bulk-add is clicked", async () => {
    const { container, flows } = await setup({
      journals: ["daily"],
      shelves: { Work: { name: "Work", journals: ["daily"] } },
    });
    vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok(undefined));
    mount(container, "Work");
    await userEvent.click(screen.getByLabelText(m.journal_dashboard_bulk_add({ name: "daily" })));
    expect(flows.invoke).toHaveBeenCalledWith(BulkAddFlow, { journalName: "daily" });
  });

  it("invokes EditShelfNameFlow with the shelf name when rename is clicked", async () => {
    const { container, flows } = await setup({ shelves: { Work: { name: "Work", journals: [] } } });
    vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ shelfName: "Work" }));
    mount(container, "Work");
    await userEvent.click(screen.getByLabelText(m.shelf_rename()));
    expect(flows.invoke).toHaveBeenCalledWith(EditShelfNameFlow, { shelfName: "Work" });
  });

  it("calls nav.back when the back breadcrumb is clicked", async () => {
    const { container } = await setup({ shelves: { Work: { name: "Work", journals: [] } } });
    const back = vi.fn();
    mount(container, "Work", { back, push: () => undefined });
    await userEvent.click(screen.getByRole("button", { name: m.common_label_back() }));
    expect(back).toHaveBeenCalled();
  });

  it("calls nav.back when the shelf no longer exists", async () => {
    const { container } = await setup({ shelves: {} });
    const back = vi.fn();
    mount(container, "Gone", { back, push: () => undefined });
    expect(back).toHaveBeenCalled();
  });

  it("assigns a newly created journal to the shelf", async () => {
    const { container, flows, shelvesRepo } = await setup({
      journals: ["daily"],
      shelves: { Work: { name: "Work", journals: [] } },
    });
    vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ name: "daily" }));
    mount(container, "Work");
    await userEvent.click(screen.getByLabelText(m.journal_create()));
    await vi.waitFor(() => expect(shelvesRepo.get("Work").getOr(undefined as never)?.journals).toEqual(["daily"]));
    expect(flows.invoke).toHaveBeenCalledWith(AddJournalFlow);
  });
});
