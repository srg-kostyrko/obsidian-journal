import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import DeleteViewModal from "./DeleteViewModal.vue";

afterEach(() => cleanup());

function mountModal() {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<void> = { submit, cancel };
  render(DeleteViewModal, {
    props: { viewName: "Weekly" },
    global: { plugins: [{ install: (app) => provideModalApiOnApp(app, api as ModalApi<unknown>) }] },
  });
  return { submit, cancel };
}

describe("DeleteViewModal", () => {
  it("submits when the user clicks Delete", async () => {
    const { submit } = mountModal();
    await userEvent.click(screen.getByText(m.common_action_delete()));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = mountModal();
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("shows the description copy", () => {
    mountModal();
    expect(screen.getByText(m.view_delete_modal_description())).toBeTruthy();
  });
});
