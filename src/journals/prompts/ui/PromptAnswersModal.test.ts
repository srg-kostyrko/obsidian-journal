import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { beforeEach, describe, expect, it } from "vitest";

import { DayPeriod } from "@/calendar";
import { anchor, date } from "@/calendar/testing";
import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { customJournal, fixedJournal } from "@/journals/testing";
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

function pathText(): string {
  const label = screen.getByText(m.journal_prompt_note_path_label());
  return label.closest(".setting-item")?.querySelector(".setting-item-control")?.textContent ?? "";
}

function renderMisc(harness: TestHarness): ReturnType<TestHarness["renderModal"]> {
  return harness.renderModal(PromptAnswersModal, {
    props: {
      metadata: { journalName: "misc", anchor: anchor("2024-01-01") },
      confirming: false,
      periodLabel: "2024-01-01",
    },
  });
}

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
        props: {
          metadata: { journalName: "named", anchor: anchor("2024-01-01") },
          confirming: false,
          periodLabel: "2024-01-01",
        },
      });
      const before = pathText();

      await userEvent.type(screen.getByRole("textbox"), "happy");

      await waitFor(() => {
        const after = pathText();
        expect(after).not.toBe(before);
        expect(after).toContain("happy");
      });
    });

    it("refuses a blank submit for the prompt in the path", async () => {
      const { submit } = harness.renderModal(PromptAnswersModal, {
        props: {
          metadata: { journalName: "named", anchor: anchor("2024-01-01") },
          confirming: false,
          periodLabel: "2024-01-01",
        },
      });

      await userEvent.click(screen.getByText(m.journal_prompt_submit()));

      await waitFor(() => {
        expect(screen.getByText(m.journal_prompt_answer_required_in_path())).toBeTruthy();
      });
      expect(submit).not.toHaveBeenCalled();
    });

    it("rejects an answer equal to the placeholder", async () => {
      const { submit } = harness.renderModal(PromptAnswersModal, {
        props: {
          metadata: { journalName: "named", anchor: anchor("2024-01-01") },
          confirming: false,
          periodLabel: "2024-01-01",
        },
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
        props: {
          metadata: { journalName: "plain", anchor: anchor("2024-01-01") },
          confirming: true,
          periodLabel: "2024-01-01",
        },
      });
      const before = pathText();

      await userEvent.type(screen.getByRole("textbox"), "happy");

      expect(pathText()).toBe(before);
    });

    it("accepts a blank answer when nothing about it reaches the note name", async () => {
      const { submit } = harness.renderModal(PromptAnswersModal, {
        props: {
          metadata: { journalName: "plain", anchor: anchor("2024-01-01") },
          confirming: false,
          periodLabel: "2024-01-01",
        },
      });

      await userEvent.click(screen.getByText(m.journal_prompt_submit()));

      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith({ mood: "" });
      });
    });

    it("shows no path at all when not confirming", () => {
      harness.renderModal(PromptAnswersModal, {
        props: {
          metadata: { journalName: "plain", anchor: anchor("2024-01-01") },
          confirming: false,
          periodLabel: "2024-01-01",
        },
      });

      expect(screen.queryByText(m.journal_prompt_note_path_label())).toBeNull();
      expect(screen.queryByText(/2024-01-01\.md/)).toBeNull();
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
        props: {
          metadata: { journalName: "asked", anchor: anchor("2024-01-01") },
          confirming: false,
          periodLabel: "2024-01-01",
        },
      });

      await userEvent.click(screen.getByText(m.journal_prompt_submit()));

      await waitFor(() => {
        expect(screen.getByText(m.journal_prompt_answer_required())).toBeTruthy();
      });
      expect(submit).not.toHaveBeenCalled();
    });

    it("lets an optional choice be left unpicked", async () => {
      const { submit } = harness.renderModal(PromptAnswersModal, {
        props: {
          metadata: { journalName: "asked", anchor: anchor("2024-01-01") },
          confirming: false,
          periodLabel: "2024-01-01",
        },
      });
      expect(screen.getByText(m.journal_prompt_select_none())).toBeTruthy();

      await userEvent.type(screen.getByRole("textbox"), "happy");
      await userEvent.click(screen.getByText(m.journal_prompt_submit()));

      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith({ mood: "happy", pick: "" });
      });
    });
  });

  describe("number, toggle, date, and required-select prompts", () => {
    const countPrompt: Prompt = {
      variable: "count",
      question: "Count?",
      type: "number",
      frontmatterKey: "count",
      required: false,
    };
    const remindPrompt: Prompt = {
      variable: "remind",
      question: "Remind?",
      type: "toggle",
      frontmatterKey: "remind",
      required: false,
    };
    const whenPrompt: Prompt = {
      variable: "when",
      question: "When?",
      type: "date",
      frontmatterKey: "when",
      required: false,
      format: "YYYY-MM-DD",
    };
    const priorityRequired: Prompt = {
      variable: "priority",
      question: "Priority?",
      type: "select",
      frontmatterKey: "priority",
      required: true,
      options: [
        { label: "One", value: "one" },
        { label: "Two", value: "two" },
      ],
    };
    const defaults = { count: 0, remind: false, when: "", priority: "one" };

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            misc: fixedJournal(
              "misc",
              { type: "day" },
              { prompts: [countPrompt, remindPrompt, whenPrompt, priorityRequired] },
            ),
          },
        },
      });
    });

    // A required select opens on its first option rather than a blank one, so there is never a
    // moment where its answer is missing; this pins that default choice and the absence of the
    // "none" option that would let the user undo it.
    it("defaults every prompt type to its own initial value and offers no blank choice on a required select", async () => {
      const { submit } = renderMisc(harness);

      expect(screen.queryByText(m.journal_prompt_select_none())).toBeNull();

      await userEvent.click(screen.getByText(m.journal_prompt_submit()));

      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith(defaults);
      });
    });

    it("submits a typed number instead of the default", async () => {
      const { submit } = renderMisc(harness);

      await userEvent.type(screen.getByRole("spinbutton"), "7");
      await userEvent.click(screen.getByText(m.journal_prompt_submit()));

      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith({ ...defaults, count: 7 });
      });
    });

    // asNumber falls back to 0 whenever the field's live value is not a number, which is
    // exactly what a cleared number input holds for an instant — losing that fallback would
    // leave the input showing the answer's last string remnant instead of a clean 0.
    it("shows 0 again once a typed number is cleared back to blank", async () => {
      renderMisc(harness);
      const input = screen.getByRole("spinbutton");

      await userEvent.type(input, "5");
      await userEvent.clear(input);

      await waitFor(() => {
        expect((input as HTMLInputElement).value).toBe("0");
      });
    });

    it("submits the toggled boolean instead of the default", async () => {
      const { submit } = renderMisc(harness);

      await userEvent.click(screen.getByRole("checkbox"));
      await userEvent.click(screen.getByText(m.journal_prompt_submit()));

      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith({ ...defaults, remind: true });
      });
    });

    it("shows the picked date and submits its anchor", async () => {
      const { submit } = renderMisc(harness);
      expect(screen.getByText(m.common_pick_a_date())).toBeTruthy();

      await userEvent.click(screen.getByText(m.common_pick_a_date()));
      const period = DayPeriod.containing(date("2024-03-05"));
      harness.modals.lastOpen<unknown, typeof period>().submit(period);

      await waitFor(() => {
        expect(screen.getByText("2024-03-05")).toBeTruthy();
      });

      await userEvent.click(screen.getByText(m.journal_prompt_submit()));

      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith({ ...defaults, when: "2024-03-05" });
      });
    });

    it("submits the newly picked option for a required select", async () => {
      const { submit } = renderMisc(harness);

      await userEvent.selectOptions(screen.getByRole("combobox"), "two");
      await userEvent.click(screen.getByText(m.journal_prompt_submit()));

      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith({ ...defaults, priority: "two" });
      });
    });
  });

  describe("when the journal config is missing", () => {
    beforeEach(async () => {
      harness = await testContainer({ modules: [journalsCoreModule] });
    });

    // The gathering flow checks the journal exists before opening this modal, but the check and
    // the mount are not atomic — a settings edit landing in between leaves the modal to cope with
    // a journal that is no longer there. It must not crash, and a confirmation still shows its
    // path row, just with nothing in it.
    it("renders no fields and an empty path when confirming a journal that no longer exists", async () => {
      const { submit } = harness.renderModal(PromptAnswersModal, {
        props: {
          metadata: { journalName: "ghost", anchor: anchor("2024-01-01") },
          confirming: true,
          periodLabel: "2024-01-01",
        },
      });

      expect(screen.queryByRole("textbox")).toBeNull();
      expect(pathText()).toBe("");

      await userEvent.click(screen.getByText(m.journal_prompt_submit()));

      await waitFor(() => {
        expect(submit).toHaveBeenCalledWith({});
      });
    });
  });

  describe("when an in-path prompt's blank answer renders an empty note name", () => {
    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            onlyMood: fixedJournal("onlyMood", { type: "day" }, { nameTemplate: "{{mood}}", prompts: [moodInName] }),
          },
        },
      });
    });

    // pathFor refuses a blank rendered name rather than writing ".md"; previewPath must absorb
    // that refusal into an empty string instead of throwing while the user has not typed yet.
    it("shows an empty preview instead of crashing", () => {
      harness.renderModal(PromptAnswersModal, {
        props: {
          metadata: { journalName: "onlyMood", anchor: anchor("2024-01-01") },
          confirming: false,
          periodLabel: "2024-01-01",
        },
      });

      expect(pathText()).toBe("");
    });
  });

  describe("the period the note is being created for", () => {
    it("names the period even when no path is shown", async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { plain: fixedJournal("plain", { type: "day" }, { prompts: [moodBodyOnly] }) } },
      });

      harness.renderModal(PromptAnswersModal, {
        props: {
          metadata: { journalName: "plain", anchor: anchor("2024-01-01") },
          confirming: false,
          periodLabel: "2024-01-15 – 2024-01-28",
        },
      });

      const label = screen.getByText(m.journal_prompt_period_label());
      expect(label.closest(".setting-item")?.querySelector(".setting-item-control")?.textContent).toBe(
        "2024-01-15 – 2024-01-28",
      );
    });

    // The preview is only worth showing if it is the path creation will use, and on a numbered
    // journal {{index}} renders from the metadata's numbers — dropping them previews "sprint .md".
    it("previews the path with the period's assigned numbers", async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { sprint: customJournal("sprint", "week", 2, "2024-01-01", { prompts: [moodBodyOnly] }) } },
      });

      harness.renderModal(PromptAnswersModal, {
        props: {
          metadata: { journalName: "sprint", anchor: anchor("2024-01-15"), numbers: { index: 2 } },
          confirming: true,
          periodLabel: "2024-01-15 – 2024-01-28",
        },
      });

      expect(pathText()).toBe("sprint 2.md");
    });
  });
});
