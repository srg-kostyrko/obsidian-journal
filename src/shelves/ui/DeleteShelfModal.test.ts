import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import DeleteShelfModal from "./DeleteShelfModal.vue";

afterEach(() => cleanup());

function mountModal(props: { shelfName?: string; otherShelves?: string[] }) {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<string> = { submit, cancel };
  render(DeleteShelfModal, {
    props: { shelfName: props.shelfName ?? "Work", otherShelves: props.otherShelves ?? [] },
    global: {
      plugins: [{ install: (app) => provideModalApiOnApp(app, api as ModalApi<unknown>) }],
    },
  });
  return { submit, cancel };
}

describe("DeleteShelfModal", () => {
  it("lists the other shelves as destinations", () => {
    mountModal({ otherShelves: ["Personal", "Archive"] });
    const optionValues = [...screen.getByRole("combobox").querySelectorAll("option")].map((o) =>
      o.getAttribute("value"),
    );
    expect(optionValues).toEqual(["", "Personal", "Archive"]);
  });

  it("shows the moved-out message when no other shelves exist", () => {
    mountModal({ otherShelves: [] });
    expect(screen.getByText(m.shelf_delete_modal_moved_out())).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("submits the empty destination when no destination is picked", async () => {
    const { submit } = mountModal({ otherShelves: ["Personal"] });
    await userEvent.click(screen.getByText(m.common_action_delete()));
    expect(submit).toHaveBeenCalledWith("");
  });

  it("submits the chosen destination", async () => {
    const { submit } = mountModal({ otherShelves: ["Personal"] });
    await userEvent.selectOptions(screen.getByRole("combobox"), "Personal");
    await userEvent.click(screen.getByText(m.common_action_delete()));
    expect(submit).toHaveBeenCalledWith("Personal");
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = mountModal({});
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
