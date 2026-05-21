import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import DeleteCommandModal from "./DeleteCommandModal.vue";

afterEach(() => cleanup());

function mountModal() {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<void> = { submit, cancel };
  render(DeleteCommandModal, {
    props: { commandName: "Open today" },
    global: {
      plugins: [{ install: (app) => provideModalApiOnApp(app, api as ModalApi<unknown>) }],
    },
  });
  return { submit, cancel };
}

describe("DeleteCommandModal", () => {
  it("names the command being deleted", () => {
    mountModal();
    expect(screen.getByText(m.command_delete_modal_confirm({ name: "Open today" }))).toBeTruthy();
  });

  it("submits when Delete is clicked", async () => {
    const { submit } = mountModal();
    await userEvent.click(screen.getByText(m.common_action_delete()));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("cancels when Cancel is clicked", async () => {
    const { cancel } = mountModal();
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
