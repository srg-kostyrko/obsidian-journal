import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import { shelfNameModal } from "./modals";
import ShelfNameModal from "./ShelfNameModal.vue";

afterEach(() => cleanup());

function mountModal(props: { currentName?: string; takenNames?: string[] }) {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<string> = { submit, cancel };
  render(ShelfNameModal, {
    props: { currentName: props.currentName, takenNames: props.takenNames ?? [] },
    global: {
      plugins: [{ install: (app) => provideModalApiOnApp(app, api as ModalApi<unknown>) }],
    },
  });
  return { submit, cancel };
}

describe("shelfNameModal definition", () => {
  it("uses the add title when no current name is supplied", () => {
    expect(shelfNameModal.title({ takenNames: [] })).toBe(m.shelf_add());
  });

  it("uses the rename title when a current name is supplied", () => {
    expect(shelfNameModal.title({ currentName: "Work", takenNames: [] })).toBe(m.shelf_rename());
  });
});

describe("ShelfNameModal", () => {
  it("submits the entered name", async () => {
    const { submit } = mountModal({});
    await userEvent.type(screen.getByRole("textbox"), "Work");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => expect(submit).toHaveBeenCalledWith("Work"));
  });

  it("surfaces a required error when the name is empty", async () => {
    const { submit } = mountModal({});
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => expect(screen.getByText(m.shelf_name_required_error())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("surfaces a uniqueness error when the name is taken", async () => {
    const { submit } = mountModal({ takenNames: ["Work"] });
    await userEvent.type(screen.getByRole("textbox"), "Work");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => expect(screen.getByText(m.shelf_name_unique_error())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects the unchanged name when renaming", async () => {
    const { submit } = mountModal({ currentName: "Work" });
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => expect(screen.getByText(m.shelf_name_unchanged_error())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = mountModal({});
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
