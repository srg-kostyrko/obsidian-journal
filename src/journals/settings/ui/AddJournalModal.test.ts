import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Calendar, DayPeriod } from "@/calendar";
import { date, installTestCalendar, testCalendar } from "@/calendar/testing";
import { m } from "@/i18n";
import { provideInjectorOnApp } from "@/infrastructure/di";
import type { ModalApi } from "@/infrastructure/host/modals";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService, provideModalApiOnApp } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { JournalsRepository } from "@/journals/repository";
import { JournalsEventsToken } from "@/journals/tokens";
import { JournalsViewModel } from "@/journals/view-model";
import { createSettingsService } from "@/settings/testing";

import AddJournalModal from "./AddJournalModal.vue";
import { addJournalModal } from "./modals";

afterEach(() => cleanup());

function makeJournal(name: string) {
  return {
    name,
    write: { type: "day" as const },
    timeline: { start: "", end: { kind: "never" as const } },
    dateFormat: "YYYY-MM-DD",
    frontmatter: {
      dateField: "journal-date",
      startDateField: "journal-start-date",
      endDateField: "journal-end-date",
      addStartDate: false,
      addEndDate: false,
    },
    numbering: { enabled: false, anchorDate: "", allowBefore: false, sources: [] },
  };
}

async function mountModal(initial?: { journals: Record<string, unknown> }) {
  const raw = initial ? { version: 4, ...initial } : { version: 4, journals: {} };
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection],
    raw,
  });
  await settings.initialize();
  container.register(JournalsEventsToken).useFactory(() => createNanoEvents());
  container.register(JournalsRepository).useClass(JournalsRepository);
  container.register(JournalsViewModel).useClass(JournalsViewModel);

  const fakeModalService = new FakeModalService();
  container.register(Calendar).useValue(testCalendar());
  container.register(ModalService).useValue(fakeModalService as unknown as ModalService);

  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<{ name: string; write: unknown }> = { submit, cancel };
  render(AddJournalModal, {
    global: {
      plugins: [
        {
          install(app) {
            provideInjectorOnApp(app, container);
            provideModalApiOnApp(app, api as ModalApi<unknown>);
          },
        },
      ],
    },
  });
  return { submit, cancel, fakeModalService };
}

describe("addJournalModal definition", () => {
  it("uses the add-journal modal title", () => {
    expect(addJournalModal.title(undefined)).toBe(m.journal_add_modal_title());
  });
});

describe("AddJournalModal", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  it("submits a fixed-write payload with defaults on save", async () => {
    const { submit } = await mountModal();
    await userEvent.type(screen.getByRole("textbox"), "daily");
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ name: "daily", write: { type: "day" } }));
  });

  it("submits a custom-write payload with the anchor selected via the picker", async () => {
    const { submit, fakeModalService } = await mountModal();
    await userEvent.type(screen.getByRole("textbox"), "sprints");
    await userEvent.selectOptions(screen.getByRole("combobox"), "custom");
    await userEvent.clear(screen.getByRole("spinbutton"));
    await userEvent.type(screen.getByRole("spinbutton"), "2");
    await userEvent.selectOptions(screen.getAllByRole("combobox")[1], "week");
    await userEvent.click(screen.getByRole("button", { name: m.common_pick_a_date() }));
    const period = DayPeriod.containing(date("2024-01-01"));
    fakeModalService.lastOpen<unknown, typeof period>().submit(period);
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        name: "sprints",
        write: { type: "custom", every: "week", duration: 2, anchorDate: "2024-01-01" },
      }),
    );
  });

  it("pluralizes the interval units when the duration is more than one", async () => {
    await mountModal();
    await userEvent.selectOptions(screen.getByRole("combobox"), "custom");
    await userEvent.clear(screen.getByRole("spinbutton"));
    await userEvent.type(screen.getByRole("spinbutton"), "3");
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: m.journal_add_modal_every_unit({ unit: "week", count: 3 }) }),
      ).toBeTruthy(),
    );
  });

  it("surfaces a required-name error when submitting without a name", async () => {
    const { submit } = await mountModal();
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => expect(screen.getByText(m.journal_name_required_error())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("surfaces a unique-name error when colliding with an existing journal", async () => {
    const { submit } = await mountModal({ journals: { daily: makeJournal("daily") } });
    await userEvent.type(screen.getByRole("textbox"), "daily");
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => {
      expect(screen.getByText(m.journal_name_unique_error())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("surfaces a required-anchor error when submitting a custom journal without picking a date", async () => {
    const { submit } = await mountModal();
    await userEvent.type(screen.getByRole("textbox"), "x");
    await userEvent.selectOptions(screen.getByRole("combobox"), "custom");
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => expect(screen.getByText(m.journal_add_modal_anchor_required_error())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = await mountModal();
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
