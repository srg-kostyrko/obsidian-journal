import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { testContainer, type TestHarness } from "@/testing";

import ConfirmCreationModal from "./ConfirmCreationModal.vue";

describe("ConfirmCreationModal", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer();
  });

  it("submits true when the user confirms", async () => {
    const { submit } = harness.renderModal(ConfirmCreationModal, {
      props: { journalName: "daily", noteName: "2026-08-27" },
    });

    await userEvent.click(screen.getByText(m.confirm_note_creation_confirm()));

    expect(submit).toHaveBeenCalledWith(true);
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = harness.renderModal(ConfirmCreationModal, {
      props: { journalName: "daily", noteName: "2026-08-27" },
    });

    await userEvent.click(screen.getByText(m.common_action_cancel()));

    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
