import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { SettingsUiService, SubpageToken } from "@/settings";
import { createSettingsService } from "@/settings/testing";

import { AddJournalFlow } from "../flows/add-journal.flow";
import { DeleteJournalFlow } from "../flows/delete-journal.flow";

import { journalEditSubpage } from "./journals-subpage";
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
  };
}

async function setup(journalNames: string[] = []) {
  const raw =
    journalNames.length === 0
      ? undefined
      : {
          version: 3,
          journals: Object.fromEntries(journalNames.map((n) => [n, makeJournal(n)])),
        };
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection],
    raw,
  });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(SubpageToken).useValue(journalEditSubpage);
  container.register(SettingsUiService).useClass(SettingsUiService);
  container.register(Flows).useClass(Flows);
  const flows = container.resolve(Flows);
  vi.spyOn(flows, "invoke").mockReturnValue({} as never);
  return { container, settings, flows, ui: container.resolve(SettingsUiService) };
}

function mount(container: Container) {
  return render(JournalsDashboardBlock, {
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

describe("JournalsDashboardBlock", () => {
  it("shows the empty state when no journals exist", async () => {
    const { container } = await setup();
    mount(container);
    expect(screen.getByText(m.journal_dashboard_empty())).toBeTruthy();
  });

  it("shows a count flair of all journals", async () => {
    const { container } = await setup(["zeta", "alpha"]);
    mount(container);
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("sorts journals alphabetically", async () => {
    const { container } = await setup(["zeta", "alpha"]);
    mount(container);
    const names = screen
      .getAllByRole("button", { name: new RegExp(`^${m.journal_dashboard_edit()} `) })
      .map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual([`${m.journal_dashboard_edit()} alpha`, `${m.journal_dashboard_edit()} zeta`]);
  });

  it("invokes AddJournalFlow when the add button is clicked", async () => {
    const { container, flows } = await setup();
    mount(container);
    await userEvent.click(screen.getByLabelText(m.journal_dashboard_add()));
    expect(flows.invoke).toHaveBeenCalledWith(AddJournalFlow);
  });

  it("pushes the journal-edit subpage when Edit is clicked", async () => {
    const { container, ui } = await setup(["daily"]);
    mount(container);
    await userEvent.click(screen.getByLabelText(`${m.journal_dashboard_edit()} daily`));
    expect(ui.current.value?.subpage.key).toBe("journal-edit");
    expect(ui.current.value?.props).toEqual({ journalName: "daily" });
  });

  it("invokes DeleteJournalFlow when Delete is clicked", async () => {
    const { container, flows } = await setup(["daily"]);
    mount(container);
    await userEvent.click(screen.getByLabelText(`${m.journal_dashboard_delete()} daily`));
    expect(flows.invoke).toHaveBeenCalledWith(DeleteJournalFlow, { journalName: "daily" });
  });
});
