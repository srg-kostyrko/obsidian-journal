import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { testContainer, type TestHarness } from "@/testing";

import { shelfNameModal } from "./modals";
import ShelfNameModal from "./ShelfNameModal.vue";

describe("shelfNameModal definition", () => {
  it("uses the add title when no current name is supplied", () => {
    expect(shelfNameModal.title({ takenNames: [] })).toBe(m.shelf_add());
  });

  it("uses the rename title when a current name is supplied", () => {
    expect(shelfNameModal.title({ currentName: "Work", takenNames: [] })).toBe(m.shelf_rename());
  });
});

describe("ShelfNameModal", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer();
  });

  it("submits the entered name", async () => {
    const { submit } = harness.renderModal<typeof ShelfNameModal, string>(ShelfNameModal, {
      props: { takenNames: [] },
    });
    await userEvent.type(screen.getByRole("textbox"), "Work");
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => expect(submit).toHaveBeenCalledWith("Work"));
  });

  it("surfaces a required error when the name is empty", async () => {
    const { submit } = harness.renderModal(ShelfNameModal, { props: { takenNames: [] } });
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => expect(screen.getByText(m.shelf_name_required_error())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("surfaces a uniqueness error when the name is taken", async () => {
    const { submit } = harness.renderModal(ShelfNameModal, { props: { takenNames: ["Work"] } });
    await userEvent.type(screen.getByRole("textbox"), "Work");
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => expect(screen.getByText(m.shelf_name_unique_error())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects the unchanged name when renaming", async () => {
    const { submit } = harness.renderModal(ShelfNameModal, { props: { currentName: "Work", takenNames: [] } });
    await userEvent.click(screen.getByText(m.common_action_submit()));
    await waitFor(() => expect(screen.getByText(m.shelf_name_unchanged_error())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = harness.renderModal(ShelfNameModal, { props: { takenNames: [] } });
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
