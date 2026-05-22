import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import type { ModalApi } from "@/infrastructure/host/modals";
import { provideModalApiOnApp } from "@/infrastructure/host/modals/testing";

import PlaceJournalModal from "./PlaceJournalModal.vue";

afterEach(() => cleanup());

function mountModal(props: { currentShelf?: string; shelfNames?: string[] }) {
  const submit = vi.fn();
  const cancel = vi.fn();
  const api: ModalApi<string> = { submit, cancel };
  render(PlaceJournalModal, {
    props: { currentShelf: props.currentShelf ?? "", shelfNames: props.shelfNames ?? [] },
    global: {
      plugins: [{ install: (app) => provideModalApiOnApp(app, api as ModalApi<unknown>) }],
    },
  });
  return { submit, cancel };
}

describe("PlaceJournalModal", () => {
  it("offers every shelf plus the not-on-a-shelf option", () => {
    mountModal({ shelfNames: ["Work", "Personal"] });
    const optionValues = [...screen.getByRole("combobox").querySelectorAll("option")].map((o) =>
      o.getAttribute("value"),
    );
    expect(optionValues).toEqual(["", "Work", "Personal"]);
  });

  it("starts with the journal's current shelf selected", () => {
    mountModal({ currentShelf: "Personal", shelfNames: ["Work", "Personal"] });
    expect(screen.getByRole<HTMLSelectElement>("combobox").value).toBe("Personal");
  });

  it("submits the chosen shelf", async () => {
    const { submit } = mountModal({ shelfNames: ["Work"] });
    await userEvent.selectOptions(screen.getByRole("combobox"), "Work");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(submit).toHaveBeenCalledWith("Work");
  });

  it("submits the empty shelf to unassign the journal", async () => {
    const { submit } = mountModal({ currentShelf: "Work", shelfNames: ["Work"] });
    await userEvent.selectOptions(screen.getByRole("combobox"), "");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(submit).toHaveBeenCalledWith("");
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = mountModal({});
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
