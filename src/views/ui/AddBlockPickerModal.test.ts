import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { testContainer, type TestHarness } from "@/testing";

import { buildViewBlockDefinition } from "../testing";

import AddBlockPickerModal from "./AddBlockPickerModal.vue";

describe("AddBlockPickerModal", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer();
  });

  it("submits the chosen key", async () => {
    const { submit } = harness.renderModal(AddBlockPickerModal, {
      props: {
        definitions: [
          buildViewBlockDefinition("month-calendar", { label: () => "Month calendar" }),
          buildViewBlockDefinition("divider", { label: () => "Divider" }),
        ],
      },
    });

    await userEvent.click(screen.getByRole("button", { name: m.view_add_picker_action({ label: "Divider" }) }));

    expect(submit).toHaveBeenCalledWith("divider");
  });

  it("shows the empty state when no blocks are registered", () => {
    harness.renderModal(AddBlockPickerModal, { props: { definitions: [] } });

    expect(screen.getByText(m.view_add_block_empty())).toBeTruthy();
  });

  it("cancels when the user clicks Close", async () => {
    const { cancel } = harness.renderModal(AddBlockPickerModal, {
      props: { definitions: [buildViewBlockDefinition("divider", { label: () => "Divider" })] },
    });

    await userEvent.click(screen.getByText(m.common_action_close()));

    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
