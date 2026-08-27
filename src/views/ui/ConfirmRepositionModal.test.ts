import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { testContainer, type TestHarness } from "@/testing";

import ConfirmRepositionModal from "./ConfirmRepositionModal.vue";

describe("ConfirmRepositionModal", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer();
  });

  it("submits when the user confirms the move", async () => {
    const { submit } = harness.renderModal(ConfirmRepositionModal, { props: { location: "the right sidebar" } });

    await userEvent.click(screen.getByText(m.view_reposition_modal_confirm()));

    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = harness.renderModal(ConfirmRepositionModal, { props: { location: "the right sidebar" } });

    await userEvent.click(screen.getByText(m.common_action_cancel()));

    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
