import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { renameNoteletTypeModal } from "./modals";
import RenameNoteletTypeModal from "./RenameNoteletTypeModal.vue";

describe("renameNoteletTypeModal definition", () => {
  it("titles the modal with the current name", () => {
    expect(renameNoteletTypeModal.title({ journalName: "Work", typeId: "nt_7f3a", currentName: "Standup" })).toBe(
      m.journal_notelet_rename_modal_title({ name: "Standup" }),
    );
  });
});

describe("RenameNoteletTypeModal", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          Work: fixedJournal(
            "Work",
            { type: "day" },
            {
              notelets: {
                nt_7f3a: buildNoteletType({ id: "nt_7f3a" as TypeId, name: "Standup" }),
                nt_91cc: buildNoteletType({ id: "nt_91cc" as TypeId, name: "Retro" }),
              },
            },
          ),
        },
      },
    });
  });

  function open(): ReturnType<TestHarness["renderModal"]> {
    return harness.renderModal(RenameNoteletTypeModal, {
      props: { journalName: "Work", typeId: "nt_7f3a", currentName: "Standup" },
    });
  }

  it("submits the new name on save", async () => {
    const { submit } = open();

    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "Daily sync");
    await userEvent.click(screen.getByText(m.common_action_submit()));

    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith({ newName: "Daily sync" });
    });
  });

  it("rejects a name a sibling type of the same journal already uses", async () => {
    const { submit } = open();

    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "Retro");
    await userEvent.click(screen.getByText(m.common_action_submit()));

    await waitFor(() => {
      expect(screen.getByText(m.journal_notelet_name_unique_error())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("accepts the type's own current name", async () => {
    const { submit } = open();

    await userEvent.click(screen.getByText(m.common_action_submit()));

    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith({ newName: "Standup" });
    });
  });

  it("rejects an empty name", async () => {
    const { submit } = open();

    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.click(screen.getByText(m.common_action_submit()));

    await waitFor(() => {
      expect(screen.getByText(m.journal_notelet_name_required_error())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = open();

    await userEvent.click(screen.getByText(m.common_action_cancel()));

    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
