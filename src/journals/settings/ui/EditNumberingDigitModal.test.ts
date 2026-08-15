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

import EditNumberingDigitModal from "./EditNumberingDigitModal.vue";
import { editNumberingDigitModal, type NumberingDigitDraft } from "./modals";

afterEach(() => cleanup());

interface DigitFixture {
  variable: string;
  frontmatterKey: string;
  anchorValue: number;
  reset: { kind: "never" } | { kind: "after"; count: number };
}

function makeJournal(name: string, sources: DigitFixture[]) {
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
    numbering: { enabled: true, anchorDate: "2024-01-01", allowBefore: false, sources },
  };
}

async function mountModal(journalName: string, sources: DigitFixture[], sourceIndex?: number) {
  const raw = { version: 4, journals: { [journalName]: makeJournal(journalName, sources) } };
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
  const api: ModalApi<NumberingDigitDraft> = { submit, cancel };
  render(EditNumberingDigitModal, {
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

describe("editNumberingDigitModal definition", () => {
  it("titles the modal for adding a digit when no source index is given", () => {
    expect(editNumberingDigitModal.title({ journalName: "daily", sourceIndex: undefined })).toBe(
      m.journal_sequence_digit_modal_title({ mode: "add" }),
    );
  });

  it("titles the modal for editing a digit when a source index is given", () => {
    expect(editNumberingDigitModal.title({ journalName: "daily", sourceIndex: 0 })).toBe(
      m.journal_sequence_digit_modal_title({ mode: "edit" }),
    );
  });
});

describe("EditNumberingDigitModal", () => {
  const twoDigits: DigitFixture[] = [
    { variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } },
    { variable: "sprint", frontmatterKey: "journal-sprint", anchorValue: 1, reset: { kind: "after", count: 6 } },
  ];

  it("never renders the reset dropdown for a non-top digit, and submits it as after-reset", async () => {
    const { submit } = await mountModal("daily", twoDigits, 1);
    expect(screen.queryByRole("combobox")).toBeNull();

    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({ variable: "sprint", reset: { kind: "after", count: 6 } }),
      );
    });
  });

  it("re-submits a non-top digit with a corrupted never-reset as after-reset, repairing it", async () => {
    const corrupted: DigitFixture[] = [
      { variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } },
      { variable: "sprint", frontmatterKey: "journal-sprint", anchorValue: 1, reset: { kind: "never" } },
    ];
    const { submit } = await mountModal("daily", corrupted, 1);

    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith(expect.objectContaining({ reset: { kind: "after", count: 2 } }));
    });
  });

  it("submits the top digit with a never-reset when Never stays selected", async () => {
    const { submit } = await mountModal("daily", twoDigits, 0);

    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith(expect.objectContaining({ variable: "index", reset: { kind: "never" } }));
    });
  });

  it("rejects a reserved variable name", async () => {
    const { submit } = await mountModal("daily", [twoDigits[0]]);
    const [variableInput] = screen.getAllByRole("textbox");
    await userEvent.type(variableInput, "date");
    await userEvent.click(screen.getByText(m.common_action_submit()));

    await waitFor(() => {
      expect(screen.getByText(m.journal_sequence_variable_reserved({ name: "date" }))).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects a variable name already used by another digit", async () => {
    const { submit } = await mountModal("daily", twoDigits, 1);
    const [variableInput] = screen.getAllByRole("textbox");
    await userEvent.clear(variableInput);
    await userEvent.type(variableInput, "index");
    await userEvent.click(screen.getByText(m.common_action_submit()));

    await waitFor(() => {
      expect(screen.getByText(m.journal_sequence_variable_duplicate({ name: "index" }))).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects a per-parent count below 2", async () => {
    const { submit } = await mountModal("daily", twoDigits, 1);
    const [countInput] = screen.getAllByRole("spinbutton").slice(1);
    await userEvent.clear(countInput);
    await userEvent.type(countInput, "1");
    await userEvent.click(screen.getByText(m.common_action_submit()));

    await waitFor(() => {
      expect(screen.getByText(m.journal_sequence_count_min())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = await mountModal("daily", twoDigits, 0);
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("rejects a corrupted non-top digit's count below 2 even though its stored reset is never", async () => {
    const corrupted: DigitFixture[] = [
      { variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } },
      { variable: "sprint", frontmatterKey: "journal-sprint", anchorValue: 1, reset: { kind: "never" } },
    ];
    const { submit } = await mountModal("daily", corrupted, 1);
    const [countInput] = screen.getAllByRole<HTMLInputElement>("spinbutton").slice(1);
    await userEvent.clear(countInput);
    await userEvent.type(countInput, "1");
    await userEvent.click(screen.getByText(m.common_action_submit()));

    await waitFor(() => {
      expect(screen.getByText(m.journal_sequence_count_min())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  describe("property key default", () => {
    it("fills a new digit's property key from the variable name as it is typed", async () => {
      await mountModal("daily", [twoDigits[0]], undefined);
      const [variableInput, keyInput] = screen.getAllByRole<HTMLInputElement>("textbox");
      await userEvent.type(variableInput, "sprint");

      await waitFor(() => {
        expect(keyInput.value).toBe("journal-sprint");
      });
    });

    it("stops tracking the variable once the property key is edited by hand", async () => {
      await mountModal("daily", [twoDigits[0]], undefined);
      const [variableInput, keyInput] = screen.getAllByRole<HTMLInputElement>("textbox");
      await userEvent.type(variableInput, "sprint");
      await waitFor(() => expect(keyInput.value).toBe("journal-sprint"));

      await userEvent.clear(keyInput);
      await userEvent.type(keyInput, "custom-key");
      await userEvent.type(variableInput, "2");

      await waitFor(() => {
        expect(keyInput.value).toBe("custom-key");
      });
    });

    it("does not overwrite an existing digit's property key when its variable is renamed", async () => {
      await mountModal("daily", twoDigits, 1);
      const [variableInput, keyInput] = screen.getAllByRole<HTMLInputElement>("textbox");
      await userEvent.clear(variableInput);
      await userEvent.type(variableInput, "cycle");

      await waitFor(() => {
        expect(variableInput.value).toBe("cycle");
      });
      expect(keyInput.value).toBe("journal-sprint");
    });
  });
});
