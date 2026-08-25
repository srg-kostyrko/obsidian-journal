import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { testContainer } from "@/testing";

import DeleteDecorationModal from "./DeleteDecorationModal.vue";

describe("DeleteDecorationModal", () => {
  it("renders the warning text", async () => {
    const harness = await testContainer();
    harness.renderModal(DeleteDecorationModal);
    expect(screen.getByText(m.decoration_delete_modal_warning())).toBeTruthy();
  });

  it("submits confirmed:true when Delete is clicked", async () => {
    const harness = await testContainer();
    const { submit } = harness.renderModal(DeleteDecorationModal);
    await userEvent.click(screen.getByText(m.common_action_delete()));
    expect(submit).toHaveBeenCalledWith({ confirmed: true });
  });

  it("cancels when Cancel is clicked", async () => {
    const harness = await testContainer();
    const { cancel } = harness.renderModal(DeleteDecorationModal);
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
