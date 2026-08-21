import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { renameJournalModal } from "./modals";
import RenameJournalModal from "./RenameJournalModal.vue";

describe("renameJournalModal definition", () => {
  it("titles the modal with the current name", () => {
    expect(renameJournalModal.title({ currentName: "daily" })).toBe(m.journal_rename_modal_title({ name: "daily" }));
  });
});

describe("RenameJournalModal", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
  });

  it("submits the new name on save", async () => {
    const { submit } = harness.renderModal<typeof RenameJournalModal, { newName: string }>(RenameJournalModal, {
      props: { currentName: "daily" },
    });

    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "morning");
    await userEvent.click(screen.getByText(m.common_action_submit()));

    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith({ newName: "morning" });
    });
  });

  it("rejects an unchanged name with same-as-current error", async () => {
    const { submit } = harness.renderModal(RenameJournalModal, { props: { currentName: "daily" } });

    await userEvent.click(screen.getByText(m.common_action_submit()));

    await waitFor(() => {
      expect(screen.getByText(m.journal_rename_modal_same_as_current_error())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects an empty new name with required error", async () => {
    const { submit } = harness.renderModal(RenameJournalModal, { props: { currentName: "daily" } });

    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.click(screen.getByText(m.common_action_submit()));

    await waitFor(() => {
      expect(screen.getByText(m.journal_name_required_error())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = harness.renderModal(RenameJournalModal, { props: { currentName: "daily" } });

    await userEvent.click(screen.getByText(m.common_action_cancel()));

    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe("RenameJournalModal with a second journal in the vault", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal("daily", { type: "day" }),
          morning: fixedJournal("morning", { type: "day" }),
        },
      },
    });
  });

  it("rejects a name that collides with another existing journal", async () => {
    const { submit } = harness.renderModal(RenameJournalModal, { props: { currentName: "daily" } });

    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "morning");
    await userEvent.click(screen.getByText(m.common_action_submit()));

    await waitFor(() => {
      expect(screen.getByText(m.journal_name_unique_error())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });
});
