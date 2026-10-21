import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeAll, describe, expect, it } from "vitest";

import { initLocale, m } from "@/i18n";
import { testContainer } from "@/testing";

import ConfirmBlockLinkModal from "./ConfirmBlockLinkModal.vue";

async function mount() {
  const harness = await testContainer({});
  return harness.renderModal<typeof ConfirmBlockLinkModal, undefined>(ConfirmBlockLinkModal, { props: {} });
}

describe("ConfirmBlockLinkModal", () => {
  beforeAll(() => initLocale("en"));

  it("warns, and moving anyway confirms", async () => {
    const { submit, cancel } = await mount();

    expect(screen.getByText(m.tasks_move_block_link_warning())).toBeTruthy();
    await userEvent.click(screen.getByText(m.tasks_move_block_link_confirm()));

    expect(submit).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("cancel confirms nothing", async () => {
    const { submit, cancel } = await mount();

    await userEvent.click(screen.getByText(m.common_action_cancel()));

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });
});
