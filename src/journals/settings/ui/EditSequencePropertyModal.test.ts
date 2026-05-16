import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { provideInjectorOnApp } from "@/infrastructure/di";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { createSettingsService } from "@/settings/testing";

import { editSequencePropertyModal } from "./edit-sequence-property-modal";
import EditSequencePropertyModal from "./EditSequencePropertyModal.vue";

afterEach(() => cleanup());

function makeJournal(name: string, frontmatterKey = "journal-index") {
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
    numbering: {
      enabled: true,
      anchorDate: "2024-01-01",
      allowBefore: false,
      sources: [{ variable: "index", frontmatterKey, anchorValue: 1, reset: { kind: "never" as const } }],
    },
  };
}

async function mountModal(journalName: string, sourceIndex = 0, frontmatterKey = "journal-index") {
  const raw = { version: 3, journals: { [journalName]: makeJournal(journalName, frontmatterKey) } };
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection],
    raw,
  });
  await settings.initialize();
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<{ newValue: string }> = { submit, cancel };
  render(EditSequencePropertyModal, {
    props: { journalName, sourceIndex },
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

describe("editSequencePropertyModal definition", () => {
  it("uses the sequence-property modal title", () => {
    expect(editSequencePropertyModal.title({ journalName: "daily", sourceIndex: 0 })).toBe(
      m.journal_sequence_property_modal_title(),
    );
  });
});

describe("EditSequencePropertyModal", () => {
  it("renders the current frontmatterKey from sources[sourceIndex]", async () => {
    await mountModal("daily", 0, "sprint-no");
    expect(screen.getByText("sprint-no")).toBeTruthy();
  });

  it("renders the notes-not-rewritten hint", async () => {
    await mountModal("daily");
    expect(screen.getByText(m.journal_notes_not_rewritten_hint())).toBeTruthy();
  });

  it("submits the new value on Save", async () => {
    const { submit } = await mountModal("daily");
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "issue-no");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith({ newValue: "issue-no" });
    });
  });

  it("rejects an empty new value with required error", async () => {
    const { submit } = await mountModal("daily");
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => {
      expect(screen.getByText(m.journal_property_name_required())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = await mountModal("daily");
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
