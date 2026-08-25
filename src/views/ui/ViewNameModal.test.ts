import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { testContainer, type TestHarness } from "@/testing";

import { FALLBACK_VIEW_ICON } from "../config";

import ViewNameModal from "./ViewNameModal.vue";

function nameInput(): HTMLElement {
  const [input] = screen.getAllByRole("textbox");
  if (!input) throw new Error("the name input is not rendered");
  return input;
}

function iconInput(): HTMLInputElement {
  const [, input] = screen.getAllByRole("textbox");
  if (!input) throw new Error("the icon input is not rendered");
  return input as HTMLInputElement;
}

describe("ViewNameModal", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer();
  });

  it("submits the entered name", async () => {
    const { submit } = harness.renderModal(ViewNameModal, { props: {} });

    await userEvent.type(nameInput(), "Weekly");
    await userEvent.click(screen.getByText(m.common_action_create()));

    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ name: "Weekly" })));
  });

  it("shows the required-error for an empty name", async () => {
    harness.renderModal(ViewNameModal, { props: {} });

    await userEvent.click(screen.getByText(m.common_action_create()));

    await waitFor(() => expect(screen.getByText(m.view_name_required_error())).toBeTruthy());
  });

  it("rejects the unchanged name when renaming", async () => {
    harness.renderModal(ViewNameModal, { props: { currentName: "Weekly" } });

    await userEvent.click(screen.getByText(m.common_action_submit()));

    await waitFor(() => expect(screen.getByText(m.view_name_unchanged_error())).toBeTruthy());
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = harness.renderModal(ViewNameModal, { props: {} });

    await userEvent.click(screen.getByText(m.common_action_cancel()));

    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("offers the fallback icon as the initial choice when creating", () => {
    harness.renderModal(ViewNameModal, { props: {} });

    expect(iconInput().value).toBe(FALLBACK_VIEW_ICON);
  });

  it("submits the icon picked from the suggestions", async () => {
    const { submit } = harness.renderModal(ViewNameModal, { props: {} });

    await userEvent.type(nameInput(), "Weekly");
    harness.inputSuggests.handleFor<string>(iconInput()).select("calendar-days");
    await userEvent.click(screen.getByText(m.common_action_create()));

    await waitFor(() => expect(submit).toHaveBeenCalledWith({ name: "Weekly", icon: "calendar-days" }));
  });

  it("omits the icon field when renaming", () => {
    harness.renderModal(ViewNameModal, { props: { currentName: "Weekly" } });

    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });
});
