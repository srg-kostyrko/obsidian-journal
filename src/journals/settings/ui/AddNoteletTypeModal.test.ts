import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import AddNoteletTypeModal from "./AddNoteletTypeModal.vue";
import { addNoteletTypeModal } from "./modals";

describe("addNoteletTypeModal definition", () => {
  it("titles the modal for adding a type", () => {
    expect(addNoteletTypeModal.title({ journalName: "Work" })).toBe(m.journal_notelet_add_modal_title());
  });
});

describe("AddNoteletTypeModal", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { Work: fixedJournal("Work", { type: "day" }) } },
    });
  });

  it("submits the entered name", async () => {
    const { submit } = harness.renderModal<typeof AddNoteletTypeModal, { name: string }>(AddNoteletTypeModal, {
      props: { journalName: "Work" },
    });

    await userEvent.type(screen.getByRole("textbox"), "Standup");
    await userEvent.click(screen.getByText(m.common_action_submit()));

    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith({ name: "Standup" });
    });
  });

  it("rejects an empty name", async () => {
    const { submit } = harness.renderModal(AddNoteletTypeModal, { props: { journalName: "Work" } });

    await userEvent.click(screen.getByText(m.common_action_submit()));

    await waitFor(() => {
      expect(screen.getByText(m.journal_notelet_name_required_error())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = harness.renderModal(AddNoteletTypeModal, { props: { journalName: "Work" } });

    await userEvent.click(screen.getByText(m.common_action_cancel()));

    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe("AddNoteletTypeModal on a journal that already has a type", () => {
  it("rejects a name another type of the same journal already uses", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          Work: fixedJournal(
            "Work",
            { type: "day" },
            { notelets: { nt_7f3a: buildNoteletType({ id: "nt_7f3a" as TypeId, name: "Standup" }) } },
          ),
        },
      },
    });
    const { submit } = harness.renderModal(AddNoteletTypeModal, { props: { journalName: "Work" } });

    await userEvent.type(screen.getByRole("textbox"), "Standup");
    await userEvent.click(screen.getByText(m.common_action_submit()));

    await waitFor(() => {
      expect(screen.getByText(m.journal_notelet_name_unique_error())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });
});
