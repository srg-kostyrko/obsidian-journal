import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { AsyncResult } from "@/infrastructure/result";
import { AddJournalFlow, journalConfigCollection } from "@/journals";
import { JournalLifecycleService } from "@/journals/settings/lifecycle";
import { SettingsUiService, SubpageToken } from "@/settings";
import { createSettingsService } from "@/settings/testing";

import { shelvesCollection } from "../config";
import { ShelvesLifecycleService } from "../lifecycle";

import { EditShelfNameFlow } from "./edit-shelf-name.flow";
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
    version: 3,
    journals: Object.fromEntries((options.journals ?? []).map((n) => [n, makeJournal(n)])),
    shelves: options.shelves ?? {},
  };
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection, shelvesCollection],
    raw,
  });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(JournalLifecycleService).useClass(JournalLifecycleService);
  container.register(ShelvesLifecycleService).useClass(ShelvesLifecycleService);
  container.register(SubpageToken).useValue(shelfEditSubpage);
  container.register(SettingsUiService).useClass(SettingsUiService);
  container.register(Flows).useClass(Flows);
  const flows = container.resolve(Flows);
  return { container, settings, flows };
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
    expect(screen.getByLabelText(`${m.journal_dashboard_edit()} daily`)).toBeTruthy();
  });

  it("invokes EditShelfNameFlow with the shelf name when rename is clicked", async () => {
    const { container, flows } = await setup({ shelves: { Work: { name: "Work", journals: [] } } });
    vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ shelfName: "Work" }));
    mount(container, "Work");
    await userEvent.click(screen.getByLabelText(m.shelf_edit_rename_tooltip()));
    expect(flows.invoke).toHaveBeenCalledWith(EditShelfNameFlow, { shelfName: "Work" });
  });

  it("calls nav.back when the back button is clicked", async () => {
    const { container } = await setup({ shelves: { Work: { name: "Work", journals: [] } } });
    const back = vi.fn();
    mount(container, "Work", { back, push: () => undefined });
    await userEvent.click(screen.getByLabelText(m.journal_edit_back_tooltip()));
    expect(back).toHaveBeenCalled();
  });

  it("calls nav.back when the shelf no longer exists", async () => {
    const { container } = await setup({ shelves: {} });
    const back = vi.fn();
    mount(container, "Gone", { back, push: () => undefined });
    expect(back).toHaveBeenCalled();
  });

  it("assigns a newly created journal to the shelf", async () => {
    const { container, flows, settings } = await setup({
      journals: ["daily"],
      shelves: { Work: { name: "Work", journals: [] } },
    });
    vi.spyOn(flows, "invoke").mockReturnValue(AsyncResult.ok({ name: "daily" }));
    mount(container, "Work");
    await userEvent.click(screen.getByLabelText(m.shelf_edit_journals_add()));
    await vi.waitFor(() => expect(settings.getCollection(shelvesCollection).get("Work")?.journals).toEqual(["daily"]));
    expect(flows.invoke).toHaveBeenCalledWith(AddJournalFlow);
  });
});
