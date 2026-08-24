import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { testContainer, type TestHarness } from "@/testing";

import { shelvesCoreModule } from "../module";

import DeleteShelfModal from "./DeleteShelfModal.vue";

describe("DeleteShelfModal", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({ modules: [journalsCoreModule, shelvesCoreModule] });
  });

  it("lists the other shelves as destinations", () => {
    harness.renderModal(DeleteShelfModal, { props: { shelfName: "Work", otherShelves: ["Personal", "Archive"] } });
    const optionValues = [...screen.getByRole("combobox").querySelectorAll("option")].map((o) =>
      o.getAttribute("value"),
    );
    expect(optionValues).toEqual(["", "Personal", "Archive"]);
  });

  it("shows the moved-out message when no other shelves exist", () => {
    harness.renderModal(DeleteShelfModal, { props: { shelfName: "Work", otherShelves: [] } });
    expect(screen.getByText(m.shelf_delete_modal_moved_out())).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("submits the empty destination when no destination is picked", async () => {
    const { submit } = harness.renderModal<typeof DeleteShelfModal, string>(DeleteShelfModal, {
      props: { shelfName: "Work", otherShelves: ["Personal"] },
    });
    await userEvent.click(screen.getByText(m.common_action_delete()));
    expect(submit).toHaveBeenCalledWith("");
  });

  it("submits the chosen destination", async () => {
    const { submit } = harness.renderModal<typeof DeleteShelfModal, string>(DeleteShelfModal, {
      props: { shelfName: "Work", otherShelves: ["Personal"] },
    });
    await userEvent.selectOptions(screen.getByRole("combobox"), "Personal");
    await userEvent.click(screen.getByText(m.common_action_delete()));
    expect(submit).toHaveBeenCalledWith("Personal");
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = harness.renderModal(DeleteShelfModal, { props: { shelfName: "Work", otherShelves: [] } });
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
