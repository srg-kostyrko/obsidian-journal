import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import CloneJournalModal from "./CloneJournalModal.vue";
import { cloneJournalModal } from "./modals";

describe("cloneJournalModal definition", () => {
  it("titles the modal with the source journal name", () => {
    expect(cloneJournalModal.title({ sourceName: "daily", suggestedName: "daily (copy)" })).toBe(
      m.journal_clone_modal_title({ name: "daily" }),
    );
  });
});

describe("CloneJournalModal", () => {
  describe("with only the source journal in the vault", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
    });

    it("prefills the name field with the suggested name", () => {
      harness.renderModal(CloneJournalModal, { props: { sourceName: "daily", suggestedName: "daily (copy)" } });
      expect(screen.getByRole("textbox")).toHaveProperty("value", "daily (copy)");
    });

    it("submits the suggested name unchanged", async () => {
      const { submit } = harness.renderModal(CloneJournalModal, {
        props: { sourceName: "daily", suggestedName: "daily (copy)" },
      });
      await userEvent.click(screen.getByText(m.common_action_submit()));
      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith({ newName: "daily (copy)" });
      });
    });

    it("submits a name the user typed", async () => {
      const { submit } = harness.renderModal(CloneJournalModal, {
        props: { sourceName: "daily", suggestedName: "daily (copy)" },
      });
      const input = screen.getByRole("textbox");
      await userEvent.clear(input);
      await userEvent.type(input, "mornings");
      await userEvent.click(screen.getByText(m.common_action_submit()));
      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith({ newName: "mornings" });
      });
    });

    it("states what a clone carries", () => {
      harness.renderModal(CloneJournalModal, { props: { sourceName: "daily", suggestedName: "daily (copy)" } });
      expect(screen.getByText(m.journal_clone_modal_description())).toBeTruthy();
    });

    it("rejects an empty name", async () => {
      const { submit } = harness.renderModal(CloneJournalModal, {
        props: { sourceName: "daily", suggestedName: "daily (copy)" },
      });
      await userEvent.clear(screen.getByRole("textbox"));
      await userEvent.click(screen.getByText(m.common_action_submit()));
      await waitFor(() => {
        expect(screen.getByText(m.journal_name_required_error())).toBeTruthy();
      });
      expect(submit).not.toHaveBeenCalled();
    });

    it("cancels when the user clicks Cancel", async () => {
      const { cancel } = harness.renderModal(CloneJournalModal, {
        props: { sourceName: "daily", suggestedName: "daily (copy)" },
      });
      await userEvent.click(screen.getByText(m.common_action_cancel()));
      expect(cancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("with another journal in the vault", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal("daily", { type: "day" }),
            weekly: fixedJournal("weekly", { type: "day" }),
          },
        },
      });
    });

    it("rejects a name already in use", async () => {
      const { submit } = harness.renderModal(CloneJournalModal, {
        props: { sourceName: "daily", suggestedName: "daily (copy)" },
      });
      const input = screen.getByRole("textbox");
      await userEvent.clear(input);
      await userEvent.type(input, "weekly");
      await userEvent.click(screen.getByText(m.common_action_submit()));
      await waitFor(() => {
        expect(screen.getByText(m.journal_name_unique_error())).toBeTruthy();
      });
      expect(submit).not.toHaveBeenCalled();
    });
  });
});
