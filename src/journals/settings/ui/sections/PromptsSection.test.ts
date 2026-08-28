import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { AsyncResult } from "@/infrastructure/result";
import { JournalsRepository } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import type { Prompt } from "@/journals/prompts/config";
import { fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { EditPromptFlow } from "../../flows/edit-prompt.flow";

import PromptsSection from "./PromptsSection.vue";

function promptsOf(harness: TestHarness): Prompt[] {
  return harness.resolve(JournalsRepository).get("daily").getOrUndefined()?.prompts ?? [];
}

const moodPrompt: Prompt = {
  variable: "mood",
  question: "How do you feel?",
  type: "text",
  frontmatterKey: "journal-mood",
  required: false,
};

describe("PromptsSection", () => {
  it("renders one row per question", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            {
              prompts: [
                moodPrompt,
                { ...moodPrompt, variable: "sleep", question: "How did you sleep?", frontmatterKey: "journal-sleep" },
              ],
            },
          ),
        },
      },
    });
    harness.render(PromptsSection, { props: { journalName: "daily" } });

    await userEvent.click(screen.getByText(m.journal_prompt_section_title()));

    expect(await screen.findByText("mood")).toBeTruthy();
    expect(await screen.findByText("sleep")).toBeTruthy();
  });

  it("invokes the prompt flow with no index when adding", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
    harness.render(PromptsSection, { props: { journalName: "daily" } });
    const invoke = vi.spyOn(harness.resolve(Flows), "invoke").mockReturnValue(AsyncResult.ok(undefined));

    await userEvent.click(screen.getByLabelText(m.journal_prompt_add()));

    expect(invoke).toHaveBeenCalledWith(EditPromptFlow, { journalName: "daily" });
  });

  it("invokes the prompt flow with the row index when editing", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { prompts: [moodPrompt] }) } },
    });
    harness.render(PromptsSection, { props: { journalName: "daily" } });
    const invoke = vi.spyOn(harness.resolve(Flows), "invoke").mockReturnValue(AsyncResult.ok(undefined));
    await userEvent.click(screen.getByText(m.journal_prompt_section_title()));

    await userEvent.click(screen.getByLabelText(m.journal_prompt_edit()));

    expect(invoke).toHaveBeenCalledWith(EditPromptFlow, { journalName: "daily", promptIndex: 0 });
  });

  it("removes the prompt at the clicked row", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            { prompts: [moodPrompt, { ...moodPrompt, variable: "sleep", frontmatterKey: "journal-sleep" }] },
          ),
        },
      },
    });
    harness.render(PromptsSection, { props: { journalName: "daily" } });
    await userEvent.click(screen.getByText(m.journal_prompt_section_title()));

    await userEvent.click(screen.getAllByLabelText(m.journal_prompt_delete())[0]);

    await waitFor(() => {
      expect(promptsOf(harness).map((p) => p.variable)).toEqual(["sleep"]);
    });
  });

  describe("required + autoCreate warning", () => {
    it("warns when a required question sits on a journal with autoCreate on", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              { autoCreate: true, prompts: [{ ...moodPrompt, required: true }] },
            ),
          },
        },
      });
      harness.render(PromptsSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByText(m.journal_prompt_section_title()));

      expect(await screen.findByText(m.journal_prompt_autocreate_required_warning())).toBeTruthy();
    });

    it("shows no warning when the required question is on a journal without autoCreate", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: {
            daily: fixedJournal(
              "daily",
              { type: "day" },
              { autoCreate: false, prompts: [{ ...moodPrompt, required: true }] },
            ),
          },
        },
      });
      harness.render(PromptsSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByText(m.journal_prompt_section_title()));

      expect(screen.queryByText(m.journal_prompt_autocreate_required_warning())).toBeNull();
    });

    it("shows no warning when autoCreate is on but no question is required", async () => {
      const harness = await testContainer({
        modules: [journalsCoreModule],
        data: {
          journals: { daily: fixedJournal("daily", { type: "day" }, { autoCreate: true, prompts: [moodPrompt] }) },
        },
      });
      harness.render(PromptsSection, { props: { journalName: "daily" } });

      await userEvent.click(screen.getByText(m.journal_prompt_section_title()));

      expect(screen.queryByText(m.journal_prompt_autocreate_required_warning())).toBeNull();
    });
  });
});
