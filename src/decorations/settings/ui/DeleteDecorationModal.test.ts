import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import DeleteDecorationModal from "./DeleteDecorationModal.vue";

afterEach(() => cleanup());

function mountModal() {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<{ confirmed: true }> = { submit, cancel };
  render(DeleteDecorationModal, {
    global: {
      plugins: [
        {
          install(app) {
            provideModalApiOnApp(app, api as ModalApi<unknown>);
          },
        },
      ],
    },
  });
  return { submit, cancel };
}

describe("DeleteDecorationModal", () => {
  it("renders the warning text", () => {
    mountModal();
    expect(screen.getByText(m.decoration_delete_modal_warning())).toBeTruthy();
  });

  it("submits confirmed:true when Delete is clicked", async () => {
    const { submit } = mountModal();
    await userEvent.click(screen.getByText(m.common_action_delete()));
    expect(submit).toHaveBeenCalledWith({ confirmed: true });
  });

  it("cancels when Cancel is clicked", async () => {
    const { cancel } = mountModal();
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
