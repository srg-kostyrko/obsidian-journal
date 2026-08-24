import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { testContainer, type TestHarness } from "@/testing";

import { commandsCoreModule } from "../module";

import DeleteCommandModal from "./DeleteCommandModal.vue";

describe("DeleteCommandModal", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({ modules: [commandsCoreModule], data: { commands: {} } });
  });

  it("names the command being deleted", () => {
    harness.renderModal(DeleteCommandModal, { props: { commandName: "Open today" } });
    expect(screen.getByText(m.command_delete_modal_confirm({ name: "Open today" }))).toBeTruthy();
  });

  it("submits when Delete is clicked", async () => {
    const { submit } = harness.renderModal(DeleteCommandModal, { props: { commandName: "Open today" } });
    await userEvent.click(screen.getByText(m.common_action_delete()));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("cancels when Cancel is clicked", async () => {
    const { cancel } = harness.renderModal(DeleteCommandModal, { props: { commandName: "Open today" } });
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
