import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import EditPromptModal from "./EditPromptModal.vue";
import { editPromptModal } from "./modals";

import type { Prompt } from "../../prompts/config";

describe("editPromptModal definition", () => {
  it("titles the modal for adding a question when no prompt index is given", () => {
    expect(editPromptModal.title({ journalName: "daily", promptIndex: undefined })).toBe(
      m.journal_prompt_modal_title({ mode: "add" }),
    );
  });

  it("titles the modal for editing a question when a prompt index is given", () => {
    expect(editPromptModal.title({ journalName: "daily", promptIndex: 0 })).toBe(
      m.journal_prompt_modal_title({ mode: "edit" }),
    );
  });
});

const moodPrompt: Prompt = {
  variable: "mood",
  question: "How do you feel?",
  type: "text",
  frontmatterKey: "journal-mood",
  required: false,
};

// question is always textbox[0], variable is always textbox[1]; frontmatterKey is always
// last — a select prompt's two option inputs land between them.
function textInputs(): HTMLElement[] {
  return screen.getAllByRole("textbox");
}

async function fillRequiredFields(variable: string): Promise<void> {
  const [question, variableInput] = textInputs();
  await userEvent.type(variableInput, variable);
  await userEvent.type(question, "q");
}

async function submitForm(): Promise<void> {
  await userEvent.click(screen.getByText(m.common_action_submit()));
}

describe("EditPromptModal", () => {
  it("rejects a variable that shadows a built-in, in any case", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
    const { submit } = harness.renderModal(EditPromptModal, { props: { journalName: "daily" } });
    await fillRequiredFields("Date");
    await submitForm();

    await waitFor(() => {
      expect(screen.getByText(m.journal_sequence_variable_reserved({ name: "Date" }))).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects a variable already used by a numbering digit", async () => {
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
                sources: [
                  { variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } },
                ],
              },
            },
          ),
        },
      },
    });
    const { submit } = harness.renderModal(EditPromptModal, { props: { journalName: "daily" } });
    await fillRequiredFields("index");
    await submitForm();

    await waitFor(() => {
      expect(screen.getByText(m.journal_prompt_variable_duplicate({ name: "index" }))).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects a variable already used by another question", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { prompts: [moodPrompt] }) } },
    });
    const { submit } = harness.renderModal(EditPromptModal, { props: { journalName: "daily" } });
    await fillRequiredFields("mood");
    await submitForm();

    await waitFor(() => {
      expect(screen.getByText(m.journal_prompt_variable_duplicate({ name: "mood" }))).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects a variable that differs only in case from another question's", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { prompts: [moodPrompt] }) } },
    });
    const { submit } = harness.renderModal(EditPromptModal, { props: { journalName: "daily" } });
    await fillRequiredFields("Mood");
    await submitForm();

    await waitFor(() => {
      expect(screen.getByText(m.journal_prompt_variable_duplicate({ name: "Mood" }))).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("errors when a prompt used in the note name has no frontmatter key", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "{{date}} {{mood}}" }) } },
    });
    const { submit } = harness.renderModal(EditPromptModal, { props: { journalName: "daily" } });
    await fillRequiredFields("mood");
    await userEvent.clear(textInputs().at(-1)!);
    await submitForm();

    await waitFor(() => {
      expect(screen.getByText(m.journal_prompt_key_required_in_path())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("does not require a frontmatter key for a prompt that stays out of the note name and folder", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
    const { submit } = harness.renderModal(EditPromptModal, { props: { journalName: "daily" } });
    await fillRequiredFields("mood");
    await userEvent.clear(textInputs().at(-1)!);
    await submitForm();

    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith(
        expect.objectContaining({ variable: "mood", frontmatterKey: "", type: "text" }),
      );
    });
  });

  it("rejects a frontmatter key already used by another question", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { prompts: [moodPrompt] }) } },
    });
    const { submit } = harness.renderModal(EditPromptModal, { props: { journalName: "daily" } });
    await fillRequiredFields("sleep");
    await userEvent.clear(textInputs().at(-1)!);
    await userEvent.type(textInputs().at(-1)!, "journal-mood");
    await submitForm();

    await waitFor(() => {
      expect(screen.getByText(m.journal_prompt_property_duplicate({ name: "journal-mood" }))).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects a frontmatter key already used by a numbering digit", async () => {
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
                sources: [
                  { variable: "index", frontmatterKey: "journal-index", anchorValue: 1, reset: { kind: "never" } },
                ],
              },
            },
          ),
        },
      },
    });
    const { submit } = harness.renderModal(EditPromptModal, { props: { journalName: "daily" } });
    await fillRequiredFields("mood");
    await userEvent.clear(textInputs().at(-1)!);
    await userEvent.type(textInputs().at(-1)!, "journal-index");
    await submitForm();

    await waitFor(() => {
      expect(screen.getByText(m.journal_prompt_property_duplicate({ name: "journal-index" }))).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects a frontmatter key that collides with the journal's own name key", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
    const { submit } = harness.renderModal(EditPromptModal, { props: { journalName: "daily" } });
    await fillRequiredFields("mood");
    await userEvent.clear(textInputs().at(-1)!);
    await userEvent.type(textInputs().at(-1)!, "journal");
    await submitForm();

    await waitFor(() => {
      expect(screen.getByText(m.journal_prompt_property_duplicate({ name: "journal" }))).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("rejects a frontmatter key that collides with the journal's configured date field", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
    const { submit } = harness.renderModal(EditPromptModal, { props: { journalName: "daily" } });
    await fillRequiredFields("mood");
    await userEvent.clear(textInputs().at(-1)!);
    await userEvent.type(textInputs().at(-1)!, "journal-date");
    await submitForm();

    await waitFor(() => {
      expect(screen.getByText(m.journal_prompt_property_duplicate({ name: "journal-date" }))).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("allows several questions to share the empty frontmatter key", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal("daily", { type: "day" }, { prompts: [{ ...moodPrompt, frontmatterKey: "" }] }),
        },
      },
    });
    const { submit } = harness.renderModal(EditPromptModal, { props: { journalName: "daily" } });
    await fillRequiredFields("sleep");
    await userEvent.clear(textInputs().at(-1)!);
    await submitForm();

    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith(expect.objectContaining({ variable: "sleep", frontmatterKey: "" }));
    });
  });

  it("errors when a toggle prompt is used in the note name or folder", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "{{date}} {{mood}}" }) } },
    });
    const { submit } = harness.renderModal(EditPromptModal, { props: { journalName: "daily" } });
    await fillRequiredFields("mood");
    await userEvent.selectOptions(screen.getByRole("combobox"), "toggle");
    await userEvent.type(textInputs().at(-1)!, "journal-mood");
    await submitForm();

    await waitFor(() => {
      expect(screen.getByText(m.journal_prompt_toggle_not_in_path())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("does not flag a toggle prompt that stays out of the note name and folder", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
    const { submit } = harness.renderModal(EditPromptModal, { props: { journalName: "daily" } });
    await fillRequiredFields("mood");
    await userEvent.selectOptions(screen.getByRole("combobox"), "toggle");
    await submitForm();

    await waitFor(() => {
      expect(submit).toHaveBeenCalledWith(expect.objectContaining({ type: "toggle" }));
    });
  });

  it("errors when a prompt would reach the note name on a journal with autoCreate on", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal("daily", { type: "day" }, { nameTemplate: "{{date}} {{mood}}", autoCreate: true }),
        },
      },
    });
    const { submit } = harness.renderModal(EditPromptModal, { props: { journalName: "daily" } });
    await fillRequiredFields("mood");
    await userEvent.type(textInputs().at(-1)!, "journal-mood");
    await submitForm();

    await waitFor(() => {
      expect(screen.getByText(m.journal_prompt_autocreate_conflict())).toBeTruthy();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("does not flag autoCreate when the prompt stays out of the note name and folder", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { autoCreate: true }) } },
    });
    const { submit } = harness.renderModal(EditPromptModal, { props: { journalName: "daily" } });
    await fillRequiredFields("mood");
    await submitForm();

    await waitFor(() => {
      expect(submit).toHaveBeenCalled();
    });
  });

  describe("select type", () => {
    it("requires at least one complete choice", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      const { submit } = harness.renderModal(EditPromptModal, { props: { journalName: "daily" } });
      await fillRequiredFields("mood");
      await userEvent.selectOptions(screen.getByRole("combobox"), "select");
      // Delete the row switching to "select" auto-added, so the list is genuinely empty.
      await userEvent.click(screen.getByLabelText(m.journal_prompt_option_delete()));
      await submitForm();

      await waitFor(() => {
        expect(screen.getByText(m.journal_prompt_options_required())).toBeTruthy();
      });
      expect(submit).not.toHaveBeenCalled();
    });

    it("points at the incomplete row's own fields, not the list, when a choice is left blank", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      const { submit } = harness.renderModal(EditPromptModal, { props: { journalName: "daily" } });
      await fillRequiredFields("mood");
      await userEvent.selectOptions(screen.getByRole("combobox"), "select");
      // The row switching to "select" auto-added is left blank.
      await submitForm();

      await waitFor(() => {
        expect(screen.getByText(m.journal_prompt_option_label_required())).toBeTruthy();
        expect(screen.getByText(m.journal_prompt_option_value_required())).toBeTruthy();
      });
      expect(screen.queryByText(m.journal_prompt_options_required())).toBeNull();
      expect(submit).not.toHaveBeenCalled();
    });

    it("submits select options with both a label and a stored value", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      const { submit } = harness.renderModal(EditPromptModal, { props: { journalName: "daily" } });
      await fillRequiredFields("mood");
      await userEvent.selectOptions(screen.getByRole("combobox"), "select");
      await userEvent.type(screen.getByLabelText(m.journal_prompt_option_label()), "开心");
      await userEvent.type(screen.getByLabelText(m.journal_prompt_option_value()), "😀");
      await submitForm();

      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith(
          expect.objectContaining({ type: "select", options: [{ label: "开心", value: "😀" }] }),
        );
      });
    });

    it("adds another empty choice row when Add choice is clicked", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      harness.renderModal(EditPromptModal, { props: { journalName: "daily" } });
      await userEvent.selectOptions(screen.getByRole("combobox"), "select");

      await userEvent.click(screen.getByText(m.journal_prompt_option_add()));

      expect(screen.getAllByLabelText(m.journal_prompt_option_label())).toHaveLength(2);
    });

    it("blocks submission when a choice row added after a complete one is left blank", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      const { submit } = harness.renderModal(EditPromptModal, { props: { journalName: "daily" } });
      await fillRequiredFields("mood");
      await userEvent.selectOptions(screen.getByRole("combobox"), "select");
      await userEvent.type(screen.getByLabelText(m.journal_prompt_option_label()), "Happy");
      await userEvent.type(screen.getByLabelText(m.journal_prompt_option_value()), "happy");
      await userEvent.click(screen.getByText(m.journal_prompt_option_add()));
      await submitForm();

      await waitFor(() => {
        expect(screen.getByText(m.journal_prompt_option_label_required())).toBeTruthy();
        expect(screen.getByText(m.journal_prompt_option_value_required())).toBeTruthy();
      });
      expect(screen.queryByText(m.journal_prompt_options_required())).toBeNull();
      expect(submit).not.toHaveBeenCalled();
    });
  });

  describe("frontmatter key autofill", () => {
    it("fills the frontmatter key from the variable for a new question", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      harness.renderModal(EditPromptModal, { props: { journalName: "daily" } });

      const [, variableInput] = textInputs();
      await userEvent.type(variableInput, "mood");

      expect((textInputs().at(-1) as HTMLInputElement).value).toBe("journal-mood");
    });

    it("stops auto-filling once the key has been edited by hand", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
      harness.renderModal(EditPromptModal, { props: { journalName: "daily" } });

      const [, variableInput] = textInputs();
      await userEvent.type(variableInput, "mood");
      const keyInput = textInputs().at(-1) as HTMLInputElement;
      await userEvent.clear(keyInput);
      await userEvent.type(keyInput, "custom-key");
      await userEvent.type(variableInput, "2");

      expect(keyInput.value).toBe("custom-key");
    });

    it("does not autofill the key when editing an existing question", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { prompts: [moodPrompt] }) } },
      });
      harness.renderModal(EditPromptModal, { props: { journalName: "daily", promptIndex: 0 } });

      const [, variableInput] = textInputs();
      await userEvent.type(variableInput, "2");

      expect((textInputs().at(-1) as HTMLInputElement).value).toBe(moodPrompt.frontmatterKey);
    });
  });

  describe("editing an existing question", () => {
    it("prefills the form from the existing prompt", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { prompts: [moodPrompt] }) } },
      });
      harness.renderModal(EditPromptModal, { props: { journalName: "daily", promptIndex: 0 } });

      const [question, variableInput] = textInputs();
      expect((question as HTMLInputElement).value).toBe("How do you feel?");
      expect((variableInput as HTMLInputElement).value).toBe("mood");
    });

    it("does not reject the prompt's own variable as a duplicate of itself", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { prompts: [moodPrompt] }) } },
      });
      const { submit } = harness.renderModal(EditPromptModal, { props: { journalName: "daily", promptIndex: 0 } });

      await submitForm();

      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith(expect.objectContaining({ variable: "mood" }));
      });
    });
  });
});
