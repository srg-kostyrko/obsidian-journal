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

import CloneJournalModal from "./CloneJournalModal.vue";
import { cloneJournalModal } from "./modals";

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

async function mountModal(props: { sourceName: string; suggestedName: string }, others: string[] = []) {
  const journals: Record<string, unknown> = { [props.sourceName]: makeJournal(props.sourceName) };
  for (const name of others) journals[name] = makeJournal(name);
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection],
    raw: { version: 5, journals },
  });
  await settings.initialize();
  container.register(JournalsEventsToken).useFactory(() => createNanoEvents());
  container.register(JournalsRepository).useClass(JournalsRepository);
  container.register(JournalsViewModel).useClass(JournalsViewModel);
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<{ newName: string }> = { submit, cancel };
  render(CloneJournalModal, {
    props,
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

describe("cloneJournalModal definition", () => {
  it("titles the modal with the source journal name", () => {
    expect(cloneJournalModal.title({ sourceName: "daily", suggestedName: "daily (copy)" })).toBe(
      m.journal_clone_modal_title({ name: "daily" }),
    );
  });
});

describe("CloneJournalModal", () => {
  it("prefills the name field with the suggested name", async () => {
    await mountModal({ sourceName: "daily", suggestedName: "daily (copy)" });
    expect(screen.getByRole("textbox")).toHaveProperty("value", "daily (copy)");
  });

  it("submits the suggested name unchanged", async () => {
    const { submit } = await mountModal({ sourceName: "daily", suggestedName: "daily (copy)" });
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith({ newName: "daily (copy)" });
    });
  });

  it("submits a name the user typed", async () => {
    const { submit } = await mountModal({ sourceName: "daily", suggestedName: "daily (copy)" });
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "mornings");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith({ newName: "mornings" });
    });
  });

  it("states what a clone carries", async () => {
    await mountModal({ sourceName: "daily", suggestedName: "daily (copy)" });
    expect(screen.getByText(m.journal_clone_modal_description())).toBeTruthy();
  });

  it("rejects a name already in use", async () => {
    const { submit } = await mountModal({ sourceName: "daily", suggestedName: "daily (copy)" }, ["weekly"]);
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "weekly");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => {
      expect(screen.getByText(m.journal_name_unique_error())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects an empty name", async () => {
    const { submit } = await mountModal({ sourceName: "daily", suggestedName: "daily (copy)" });
    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => {
      expect(screen.getByText(m.journal_name_required_error())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = await mountModal({ sourceName: "daily", suggestedName: "daily (copy)" });
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
