import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { testContainer, type TestHarness } from "@/testing";

import DeleteViewModal from "./DeleteViewModal.vue";

describe("DeleteViewModal", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer();
  });

  it("submits when the user clicks Delete", async () => {
    const { submit } = harness.renderModal(DeleteViewModal, { props: { viewName: "Weekly" } });

    await userEvent.click(screen.getByText(m.common_action_delete()));

    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = harness.renderModal(DeleteViewModal, { props: { viewName: "Weekly" } });

    await userEvent.click(screen.getByText(m.common_action_cancel()));

    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("shows the description copy", () => {
    harness.renderModal(DeleteViewModal, { props: { viewName: "Weekly" } });

    expect(screen.getByText(m.view_delete_modal_description())).toBeTruthy();
  });
});
