import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { PROMPT_PLACEHOLDER } from "../placeholder";

import PromptAnswersModal from "./PromptAnswersModal.vue";

import type { Prompt } from "../config";

const moodInName: Prompt = {
  variable: "mood",
  question: "Mood?",
  type: "text",
  frontmatterKey: "mood",
  required: false,
};

const moodBodyOnly: Prompt = { ...moodInName, frontmatterKey: "" };

describe("PromptAnswersModal", () => {
  let harness: TestHarness;

  describe("when a prompt reaches the note name", () => {
    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            named: fixedJournal(
              "named",
              { type: "day" },
              { nameTemplate: "{{date:YYYY-MM-DD}} {{mood}}", prompts: [moodInName] },
            ),
          },
        },
      });
    });

    it("shows a live preview that updates as the answer changes", async () => {
      harness.renderModal(PromptAnswersModal, {
        props: { journalName: "named", anchor: anchor("2024-01-01"), confirming: false, periodLabel: "2024-01-01" },
      });
      const before = screen.getByText(/2024-01-01/).textContent;

      await userEvent.type(screen.getByRole("textbox"), "happy");

      await waitFor(() => {
        const after = screen.getByText(/2024-01-01/).textContent;
        expect(after).not.toBe(before);
        expect(after).toContain("happy");
      });
    });

    it("refuses a blank submit for the prompt in the path", async () => {
      const { submit } = harness.renderModal(PromptAnswersModal, {
        props: { journalName: "named", anchor: anchor("2024-01-01"), confirming: false, periodLabel: "2024-01-01" },
      });

      await userEvent.click(screen.getByText(m.journal_prompt_submit()));

      await waitFor(() => {
        expect(screen.getByText(m.journal_prompt_answer_required_in_path())).toBeTruthy();
      });
      expect(submit).not.toHaveBeenCalled();
    });

    it("rejects an answer equal to the placeholder", async () => {
      const { submit } = harness.renderModal(PromptAnswersModal, {
        props: { journalName: "named", anchor: anchor("2024-01-01"), confirming: false, periodLabel: "2024-01-01" },
      });

      await userEvent.type(screen.getByRole("textbox"), PROMPT_PLACEHOLDER);
      await userEvent.click(screen.getByText(m.journal_prompt_submit()));

      await waitFor(() => {
        expect(screen.getByText(m.journal_prompt_answer_reserved({ name: PROMPT_PLACEHOLDER }))).toBeTruthy();
      });
      expect(submit).not.toHaveBeenCalled();
    });
  });

  describe("when no prompt reaches the note name", () => {
    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            plain: fixedJournal("plain", { type: "day" }, { prompts: [moodBodyOnly] }),
          },
        },
      });
    });

    it("shows the note name statically when confirming, and typing does not move it", async () => {
      harness.renderModal(PromptAnswersModal, {
        props: { journalName: "plain", anchor: anchor("2024-01-01"), confirming: true, periodLabel: "2024-01-01" },
      });
      const before = screen.getByText(/2024-01-01/).textContent;

      await userEvent.type(screen.getByRole("textbox"), "happy");

      expect(screen.getByText(/2024-01-01/).textContent).toBe(before);
    });

    it("accepts a blank answer when nothing about it reaches the note name", async () => {
      const { submit } = harness.renderModal(PromptAnswersModal, {
        props: { journalName: "plain", anchor: anchor("2024-01-01"), confirming: false, periodLabel: "2024-01-01" },
      });

      await userEvent.click(screen.getByText(m.journal_prompt_submit()));

      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith({ mood: "" });
      });
    });

    it("shows no path at all when not confirming", () => {
      harness.renderModal(PromptAnswersModal, {
        props: { journalName: "plain", anchor: anchor("2024-01-01"), confirming: false, periodLabel: "2024-01-01" },
      });

      expect(screen.queryByText(m.journal_prompt_note_path_label())).toBeNull();
      expect(screen.queryByText(/2024-01-01/)).toBeNull();
    });
  });

  describe("when a required prompt does not reach the note name", () => {
    const requiredText: Prompt = { ...moodBodyOnly, frontmatterKey: "mood", required: true };
    const optionalPick: Prompt = {
      variable: "pick",
      question: "Pick?",
      type: "select",
      frontmatterKey: "pick",
      required: false,
      options: [
        { label: "One", value: "one" },
        { label: "Two", value: "two" },
      ],
    };

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            asked: fixedJournal("asked", { type: "day" }, { prompts: [requiredText, optionalPick] }),
          },
        },
      });
    });

    it("refuses a blank submit for a required prompt", async () => {
      const { submit } = harness.renderModal(PromptAnswersModal, {
        props: { journalName: "asked", anchor: anchor("2024-01-01"), confirming: false, periodLabel: "2024-01-01" },
      });

      await userEvent.click(screen.getByText(m.journal_prompt_submit()));

      await waitFor(() => {
        expect(screen.getByText(m.journal_prompt_answer_required())).toBeTruthy();
      });
      expect(submit).not.toHaveBeenCalled();
    });

    it("lets an optional choice be left unpicked", async () => {
      const { submit } = harness.renderModal(PromptAnswersModal, {
        props: { journalName: "asked", anchor: anchor("2024-01-01"), confirming: false, periodLabel: "2024-01-01" },
      });
      expect(screen.getByText(m.journal_prompt_select_none())).toBeTruthy();

      await userEvent.type(screen.getByRole("textbox"), "happy");
      await userEvent.click(screen.getByText(m.journal_prompt_submit()));

      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith({ mood: "happy", pick: "" });
      });
    });
  });
});
