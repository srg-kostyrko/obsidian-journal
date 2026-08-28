import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import EditNumberingDigitModal from "./EditNumberingDigitModal.vue";
import { editNumberingDigitModal } from "./modals";

import type { NumberingSource } from "../../config";

describe("editNumberingDigitModal definition", () => {
  it("titles the modal for adding a digit when no source index is given", () => {
    expect(editNumberingDigitModal.title({ journalName: "daily", sourceIndex: undefined })).toBe(
      m.journal_sequence_digit_modal_title({ mode: "add" }),
    );
  });

  it("titles the modal for editing a digit when a source index is given", () => {
    expect(editNumberingDigitModal.title({ journalName: "daily", sourceIndex: 0 })).toBe(
      m.journal_sequence_digit_modal_title({ mode: "edit" }),
    );
  });
});

describe("EditNumberingDigitModal", () => {
  const twoDigits: NumberingSource[] = [
    { variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } },
    { variable: "sprint", frontmatterKey: "journal-sprint", anchorValue: 1, reset: { kind: "after", count: 6 } },
  ];
  const corrupted: NumberingSource[] = [
    { variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } },
    { variable: "sprint", frontmatterKey: "journal-sprint", anchorValue: 1, reset: { kind: "never" } },
  ];

  describe("with two digits, one top and one after-reset", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                numbering: { enabled: true, anchorDate: anchor("2024-01-01"), allowBefore: false, sources: twoDigits },
              },
            ),
          },
        },
      });
    });

    it("never renders the reset dropdown for a non-top digit, and submits it as after-reset", async () => {
      const { submit } = harness.renderModal(EditNumberingDigitModal, {
        props: { journalName: "daily", sourceIndex: 1 },
      });
      expect(screen.queryByRole("combobox")).toBeNull();

      await userEvent.click(screen.getByText(m.common_action_submit()));
      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith(
          expect.objectContaining({ variable: "sprint", reset: { kind: "after", count: 6 } }),
        );
      });
    });

    it("submits the top digit with a never-reset when Never stays selected", async () => {
      const { submit } = harness.renderModal(EditNumberingDigitModal, {
        props: { journalName: "daily", sourceIndex: 0 },
      });

      await userEvent.click(screen.getByText(m.common_action_submit()));
      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith(expect.objectContaining({ variable: "index", reset: { kind: "never" } }));
      });
    });

    it("rejects a variable name already used by another digit", async () => {
      const { submit } = harness.renderModal(EditNumberingDigitModal, {
        props: { journalName: "daily", sourceIndex: 1 },
      });
      const [variableInput] = screen.getAllByRole("textbox");
      await userEvent.clear(variableInput);
      await userEvent.type(variableInput, "index");
      await userEvent.click(screen.getByText(m.common_action_submit()));

      await waitFor(() => {
        expect(screen.getByText(m.journal_sequence_variable_duplicate({ name: "index" }))).toBeTruthy();
      });
      expect(submit).not.toHaveBeenCalled();
    });

    it("rejects a per-parent count below 2", async () => {
      const { submit } = harness.renderModal(EditNumberingDigitModal, {
        props: { journalName: "daily", sourceIndex: 1 },
      });
      const [countInput] = screen.getAllByRole("spinbutton").slice(1);
      await userEvent.clear(countInput);
      await userEvent.type(countInput, "1");
      await userEvent.click(screen.getByText(m.common_action_submit()));

      await waitFor(() => {
        expect(screen.getByText(m.journal_sequence_count_min())).toBeTruthy();
      });
      expect(submit).not.toHaveBeenCalled();
    });

    it("cancels when the user clicks Cancel", async () => {
      const { cancel } = harness.renderModal(EditNumberingDigitModal, {
        props: { journalName: "daily", sourceIndex: 0 },
      });
      await userEvent.click(screen.getByText(m.common_action_cancel()));
      expect(cancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("with a corrupted non-top digit missing its after-reset", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                numbering: { enabled: true, anchorDate: anchor("2024-01-01"), allowBefore: false, sources: corrupted },
              },
            ),
          },
        },
      });
    });

    it("re-submits a non-top digit with a corrupted never-reset as after-reset, repairing it", async () => {
      const { submit } = harness.renderModal(EditNumberingDigitModal, {
        props: { journalName: "daily", sourceIndex: 1 },
      });

      await userEvent.click(screen.getByText(m.common_action_submit()));
      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith(expect.objectContaining({ reset: { kind: "after", count: 2 } }));
      });
    });

    it("rejects a corrupted non-top digit's count below 2 even though its stored reset is never", async () => {
      const { submit } = harness.renderModal(EditNumberingDigitModal, {
        props: { journalName: "daily", sourceIndex: 1 },
      });
      const [countInput] = screen.getAllByRole<HTMLInputElement>("spinbutton").slice(1);
      await userEvent.clear(countInput);
      await userEvent.type(countInput, "1");
      await userEvent.click(screen.getByText(m.common_action_submit()));

      await waitFor(() => {
        expect(screen.getByText(m.journal_sequence_count_min())).toBeTruthy();
      });
      expect(submit).not.toHaveBeenCalled();
    });
  });

  it("rejects a numbering digit whose variable is already a prompt", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            {
              numbering: {
                enabled: true,
                anchorDate: anchor("2024-01-01"),
                allowBefore: false,
                sources: [twoDigits[0]],
              },
              prompts: [
                { variable: "mood", question: "How do you feel?", type: "text", frontmatterKey: "", required: false },
              ],
            },
          ),
        },
      },
    });
    const { submit } = harness.renderModal(EditNumberingDigitModal, { props: { journalName: "daily" } });
    const [variableInput] = screen.getAllByRole("textbox");
    await userEvent.type(variableInput, "mood");
    await userEvent.click(screen.getByText(m.common_action_submit()));

    await waitFor(() => {
      expect(screen.getByText(m.journal_sequence_variable_duplicate({ name: "mood" }))).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects a numbering digit whose variable differs only in case from a prompt's", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            {
              numbering: {
                enabled: true,
                anchorDate: anchor("2024-01-01"),
                allowBefore: false,
                sources: [twoDigits[0]],
              },
              prompts: [
                { variable: "mood", question: "How do you feel?", type: "text", frontmatterKey: "", required: false },
              ],
            },
          ),
        },
      },
    });
    const { submit } = harness.renderModal(EditNumberingDigitModal, { props: { journalName: "daily" } });
    const [variableInput] = screen.getAllByRole("textbox");
    await userEvent.type(variableInput, "Mood");
    await userEvent.click(screen.getByText(m.common_action_submit()));

    await waitFor(() => {
      expect(screen.getByText(m.journal_sequence_variable_duplicate({ name: "Mood" }))).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects a numbering digit's property key when a prompt already writes to it", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            {
              numbering: { enabled: true, anchorDate: anchor("2024-01-01"), allowBefore: false, sources: [] },
              prompts: [
                {
                  variable: "mood",
                  question: "How do you feel?",
                  type: "text",
                  frontmatterKey: "journal-mood",
                  required: false,
                },
              ],
            },
          ),
        },
      },
    });
    const { submit } = harness.renderModal(EditNumberingDigitModal, { props: { journalName: "daily" } });
    const [variableInput, keyInput] = screen.getAllByRole<HTMLInputElement>("textbox");
    await userEvent.type(variableInput, "index");
    await userEvent.clear(keyInput);
    await userEvent.type(keyInput, "journal-mood");
    await userEvent.click(screen.getByText(m.common_action_submit()));

    await waitFor(() => {
      expect(screen.getByText(m.journal_prompt_property_duplicate({ name: "journal-mood" }))).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects a reserved variable name", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            {
              numbering: {
                enabled: true,
                anchorDate: anchor("2024-01-01"),
                allowBefore: false,
                sources: [twoDigits[0]],
              },
            },
          ),
        },
      },
    });
    const { submit } = harness.renderModal(EditNumberingDigitModal, { props: { journalName: "daily" } });
    const [variableInput] = screen.getAllByRole("textbox");
    await userEvent.type(variableInput, "date");
    await userEvent.click(screen.getByText(m.common_action_submit()));

    await waitFor(() => {
      expect(screen.getByText(m.journal_sequence_variable_reserved({ name: "date" }))).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  describe("property key default", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                numbering: {
                  enabled: true,
                  anchorDate: anchor("2024-01-01"),
                  allowBefore: false,
                  sources: [twoDigits[0]],
                },
              },
            ),
          },
        },
      });
    });

    it("fills a new digit's property key from the variable name as it is typed", async () => {
      harness.renderModal(EditNumberingDigitModal, { props: { journalName: "daily" } });
      const [variableInput, keyInput] = screen.getAllByRole<HTMLInputElement>("textbox");
      await userEvent.type(variableInput, "sprint");

      await waitFor(() => {
        expect(keyInput.value).toBe("journal-sprint");
      });
    });

    it("stops tracking the variable once the property key is edited by hand", async () => {
      harness.renderModal(EditNumberingDigitModal, { props: { journalName: "daily" } });
      const [variableInput, keyInput] = screen.getAllByRole<HTMLInputElement>("textbox");
      await userEvent.type(variableInput, "sprint");
      await waitFor(() => expect(keyInput.value).toBe("journal-sprint"));

      await userEvent.clear(keyInput);
      await userEvent.type(keyInput, "custom-key");
      await userEvent.type(variableInput, "2");

      await waitFor(() => {
        expect(keyInput.value).toBe("custom-key");
      });
    });
  });

  describe("renaming an existing digit's variable", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              {
                numbering: { enabled: true, anchorDate: anchor("2024-01-01"), allowBefore: false, sources: twoDigits },
              },
            ),
          },
        },
      });
    });

    it("does not overwrite an existing digit's property key when its variable is renamed", async () => {
      harness.renderModal(EditNumberingDigitModal, { props: { journalName: "daily", sourceIndex: 1 } });
      const [variableInput, keyInput] = screen.getAllByRole<HTMLInputElement>("textbox");
      await userEvent.clear(variableInput);
      await userEvent.type(variableInput, "cycle");

      await waitFor(() => {
        expect(variableInput.value).toBe("cycle");
      });
      expect(keyInput.value).toBe("journal-sprint");
    });
  });
});
