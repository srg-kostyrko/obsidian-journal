import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import ViewNameModal from "./ViewNameModal.vue";

afterEach(() => cleanup());

function mountModal(props: { currentName?: string } = {}) {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<string> = { submit, cancel };
  render(ViewNameModal, {
    props,
    global: {
      plugins: [{ install: (app) => provideModalApiOnApp(app, api as ModalApi<unknown>) }],
    },
  });
  return { submit, cancel };
}

describe("ViewNameModal", () => {
  it("submits the entered name", async () => {
    const { submit } = mountModal();
    await userEvent.type(screen.getByRole("textbox"), "Weekly");
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => expect(submit).toHaveBeenCalledWith("Weekly"));
  });

  it("shows the required-error for an empty name", async () => {
    mountModal();
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => expect(screen.getByText(m.view_name_required_error())).toBeTruthy());
  });

  it("rejects the unchanged name when renaming", async () => {
    mountModal({ currentName: "Weekly" });
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => expect(screen.getByText(m.view_name_unchanged_error())).toBeTruthy());
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = mountModal();
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
