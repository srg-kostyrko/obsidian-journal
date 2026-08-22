import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { DayPeriod } from "@/calendar";
import { date } from "@/calendar/testing";
import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import AddJournalModal from "./AddJournalModal.vue";
import { addJournalModal } from "./modals";

describe("addJournalModal definition", () => {
  it("uses the add-journal modal title", () => {
    expect(addJournalModal.title(undefined)).toBe(m.journal_add_modal_title());
  });
});

describe("AddJournalModal", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({ modules: [journalsCoreModule] });
  });

  it("submits a fixed-write payload with defaults on save", async () => {
    const { submit } = harness.renderModal(AddJournalModal);
    await userEvent.type(screen.getByRole("textbox"), "daily");
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ name: "daily", write: { type: "day" } }));
  });

  it("submits a custom-write payload with the anchor selected via the picker", async () => {
    const { submit } = harness.renderModal(AddJournalModal);
    await userEvent.type(screen.getByRole("textbox"), "sprints");
    await userEvent.selectOptions(screen.getByRole("combobox"), "custom");
    await userEvent.clear(screen.getByRole("spinbutton"));
    await userEvent.type(screen.getByRole("spinbutton"), "2");
    await userEvent.selectOptions(screen.getAllByRole("combobox")[1], "week");
    await userEvent.click(screen.getByRole("button", { name: m.common_pick_a_date() }));
    const period = DayPeriod.containing(date("2024-01-01"));
    harness.modals.lastOpen<unknown, typeof period>().submit(period);
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        name: "sprints",
        write: { type: "custom", every: "week", duration: 2, anchorDate: "2024-01-01" },
      }),
    );
  });

  it("pluralizes the interval units when the duration is more than one", async () => {
    harness.renderModal(AddJournalModal);
    await userEvent.selectOptions(screen.getByRole("combobox"), "custom");
    await userEvent.clear(screen.getByRole("spinbutton"));
    await userEvent.type(screen.getByRole("spinbutton"), "3");
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: m.journal_add_modal_every_unit({ unit: "week", count: 3 }) }),
      ).toBeTruthy(),
    );
  });

  it("surfaces a required-name error when submitting without a name", async () => {
    const { submit } = harness.renderModal(AddJournalModal);
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => expect(screen.getByText(m.journal_name_required_error())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("surfaces a required-anchor error when submitting a custom journal without picking a date", async () => {
    const { submit } = harness.renderModal(AddJournalModal);
    await userEvent.type(screen.getByRole("textbox"), "x");
    await userEvent.selectOptions(screen.getByRole("combobox"), "custom");
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => expect(screen.getByText(m.journal_add_modal_anchor_required_error())).toBeTruthy());
    expect(submit).not.toHaveBeenCalled();
  });

  it("cancels when the user clicks Cancel", async () => {
    const { cancel } = harness.renderModal(AddJournalModal);
    await userEvent.click(screen.getByText(m.common_action_cancel()));
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe("AddJournalModal with a journal already in the vault", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
  });

  it("surfaces a unique-name error when colliding with an existing journal", async () => {
    const { submit } = harness.renderModal(AddJournalModal);
    await userEvent.type(screen.getByRole("textbox"), "daily");
    await userEvent.click(screen.getByText(m.common_action_create()));
    await waitFor(() => {
      expect(screen.getByText(m.journal_name_unique_error())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });
});
