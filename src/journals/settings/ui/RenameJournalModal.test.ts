import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { provideInjectorOnApp } from "@/infrastructure/di";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { JournalsRepository } from "@/journals/repository";
import { JournalsEventsToken } from "@/journals/tokens";
import { JournalsViewModel } from "@/journals/view-model";
import { createSettingsService } from "@/settings/testing";

import { renameJournalModal } from "./modals";
import RenameJournalModal from "./RenameJournalModal.vue";

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

async function mountModal(currentName: string, initial?: { journals: Record<string, unknown> }) {
  const baseJournals: Record<string, unknown> = { [currentName]: makeJournal(currentName) };
  const raw = { version: 4, journals: { ...baseJournals, ...initial?.journals } };
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection],
    raw,
  });
  await settings.initialize();
  container.register(JournalsEventsToken).useFactory(() => createNanoEvents());
  container.register(JournalsRepository).useClass(JournalsRepository);
  container.register(JournalsViewModel).useClass(JournalsViewModel);
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<{ newName: string }> = { submit, cancel };
  render(RenameJournalModal, {
    props: { currentName },
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

describe("renameJournalModal definition", () => {
  it("titles the modal with the current name", () => {
    expect(renameJournalModal.title({ currentName: "daily" })).toBe(m.journal_rename_modal_title({ name: "daily" }));
  });
});

describe("RenameJournalModal", () => {
  it("submits the new name on save", async () => {
    const { submit } = await mountModal("daily");
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "morning");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith({ newName: "morning" });
    });
  });

  it("rejects an unchanged name with same-as-current error", async () => {
    const { submit } = await mountModal("daily");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => {
      expect(screen.getByText(m.journal_rename_modal_same_as_current_error())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects a name that collides with another existing journal", async () => {
    const { submit } = await mountModal("daily", { journals: { morning: makeJournal("morning") } });
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "morning");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => {
      expect(screen.getByText(m.journal_name_unique_error())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects an empty new name with required error", async () => {
    const { submit } = await mountModal("daily");
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => {
      expect(screen.getByText(m.journal_name_required_error())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = await mountModal("daily");
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
