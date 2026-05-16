import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { provideInjectorOnApp } from "@/infrastructure/di";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { createSettingsService } from "@/settings/testing";

import { addJournalModal } from "./add-journal-modal";
import AddJournalModal from "./AddJournalModal.vue";

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
  const raw = initial ? { version: 3, ...initial } : { version: 3, journals: {} };
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection],
    raw,
  });
  await settings.initialize();
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
  return { submit, cancel };
}

describe("addJournalModal definition", () => {
  it("uses the add-journal modal title", () => {
    expect(addJournalModal.title()).toBe(m.journal_add_modal_title());
  });
});

describe("AddJournalModal", () => {
  it("submits a fixed-write payload with defaults on save", async () => {
    const { submit } = await mountModal();
    await userEvent.type(screen.getByRole("textbox"), "daily");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ name: "daily", write: { type: "day" } }));
  });

  it("submits a custom-write payload with every/duration/anchorDate", async () => {
    const { submit } = await mountModal();
    await userEvent.type(screen.getByRole("textbox"), "sprints");
    await userEvent.selectOptions(screen.getByRole("combobox"), "custom");
    await userEvent.clear(screen.getByRole("spinbutton"));
    await userEvent.type(screen.getByRole("spinbutton"), "2");
    await userEvent.selectOptions(screen.getAllByRole("combobox")[1], "week");
    await userEvent.type(screen.getAllByRole("textbox")[1], "2024-01-01");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        name: "sprints",
        write: { type: "custom", every: "week", duration: 2, anchorDate: "2024-01-01" },
      }),
    );
  });

  it("surfaces a required-name error when submitting without a name", async () => {
    const { submit } = await mountModal();
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => expect(screen.getByText(m.journal_name_required_error())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("surfaces a unique-name error when colliding with an existing journal", async () => {
    const { submit } = await mountModal({ journals: { daily: makeJournal("daily") } });
    await userEvent.type(screen.getByRole("textbox"), "daily");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(screen.getByText(m.journal_name_unique_error())).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it("surfaces an anchor-format error when custom anchor is missing", async () => {
    const { submit } = await mountModal();
    await userEvent.type(screen.getByRole("textbox"), "x");
    await userEvent.selectOptions(screen.getByRole("combobox"), "custom");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => expect(screen.getByText(m.journal_anchor_format_error())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = await mountModal();
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
