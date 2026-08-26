import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { testContainer, type TestHarness } from "@/testing";

import PlaceJournalModal from "./PlaceJournalModal.vue";

describe("PlaceJournalModal", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer();
  });

  it("offers every shelf plus the not-on-a-shelf option", () => {
    harness.renderModal(PlaceJournalModal, { props: { currentShelf: "", shelfNames: ["Work", "Personal"] } });
    const optionValues = [...screen.getByRole("combobox").querySelectorAll("option")].map((o) =>
      o.getAttribute("value"),
    );
    expect(optionValues).toEqual(["", "Work", "Personal"]);
  });

  it("starts with the journal's current shelf selected", () => {
    harness.renderModal(PlaceJournalModal, { props: { currentShelf: "Personal", shelfNames: ["Work", "Personal"] } });
    expect(screen.getByRole<HTMLSelectElement>("combobox").value).toBe("Personal");
  });

  it("submits the chosen shelf", async () => {
    const { submit } = harness.renderModal<typeof PlaceJournalModal, string>(PlaceJournalModal, {
      props: { currentShelf: "", shelfNames: ["Work"] },
    });
    await userEvent.selectOptions(screen.getByRole("combobox"), "Work");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(submit).toHaveBeenCalledWith("Work");
  });

  it("submits the empty shelf to unassign the journal", async () => {
    const { submit } = harness.renderModal<typeof PlaceJournalModal, string>(PlaceJournalModal, {
      props: { currentShelf: "Work", shelfNames: ["Work"] },
    });
    await userEvent.selectOptions(screen.getByRole("combobox"), "");
    await userEvent.click(screen.getByText(m.common_action_submit()));
    expect(submit).toHaveBeenCalledWith("");
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = harness.renderModal(PlaceJournalModal, { props: { currentShelf: "", shelfNames: [] } });
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
