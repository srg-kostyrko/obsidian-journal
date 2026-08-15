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

import EditFrontmatterFieldModal from "./EditFrontmatterFieldModal.vue";
import { editFrontmatterFieldModal, type FrontmatterFieldName } from "./modals";

afterEach(() => cleanup());

function makeJournal(
  name: string,
  frontmatter: Partial<{ dateField: string; startDateField: string; endDateField: string }> = {},
) {
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
      ...frontmatter,
    },
    numbering: { enabled: false, anchorDate: "2024-01-01", allowBefore: false, sources: [] },
  };
}

async function mountModal(
  journalName: string,
  fieldName: FrontmatterFieldName,
  fmOverride: Partial<{ dateField: string; startDateField: string; endDateField: string }> = {},
) {
  const raw = { version: 5, journals: { [journalName]: makeJournal(journalName, fmOverride) } };
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
  const api: ModalApi<{ newValue: string }> = { submit, cancel };
  render(EditFrontmatterFieldModal, {
    props: { journalName, fieldName },
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

describe("editFrontmatterFieldModal definition", () => {
  it("titles the modal using the field name variant", () => {
    expect(editFrontmatterFieldModal.title({ journalName: "daily", fieldName: "dateField" })).toBe(
      m.journal_fm_field_modal_title({ field: "dateField" }),
    );
  });
});

describe("EditFrontmatterFieldModal", () => {
  it("renders the current dateField value", async () => {
    await mountModal("daily", "dateField", { dateField: "occurred-on" });
    expect(screen.getByText("occurred-on")).toBeTruthy();
  });

  it("renders the current startDateField value", async () => {
    await mountModal("daily", "startDateField", { startDateField: "begins-on" });
    expect(screen.getByText("begins-on")).toBeTruthy();
  });

  it("renders the current endDateField value", async () => {
    await mountModal("daily", "endDateField", { endDateField: "ends-on" });
    expect(screen.getByText("ends-on")).toBeTruthy();
  });

  it("submits the new value on Save", async () => {
    const { submit } = await mountModal("daily", "dateField");
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "happened-on");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith({ newValue: "happened-on" });
    });
  });

  it("rejects an empty new value with required error", async () => {
    const { submit } = await mountModal("daily", "dateField");
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => {
      expect(screen.getByText(m.journal_property_name_required())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = await mountModal("daily", "dateField");
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
