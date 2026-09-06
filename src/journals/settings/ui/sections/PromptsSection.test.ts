import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { AsyncResult } from "@/infrastructure/result";
import { JournalsRepository } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import type { Prompt } from "@/journals/prompts/config";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
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

  it("shows an empty state when the journal has no questions", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
    harness.render(PromptsSection, { props: { journalName: "daily" } });

    await userEvent.click(screen.getByText(m.journal_prompt_section_title()));

    expect(await screen.findByText(m.journal_prompt_section_empty())).toBeTruthy();
  });

  it("leads each row with the question and shows the answer type the way the journal list shows a write type", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal(
            "daily",
            { type: "day" },
            { prompts: [{ ...moodPrompt, type: "date", format: "YYYY-MM-DD" }] },
          ),
        },
      },
    });
    harness.render(PromptsSection, { props: { journalName: "daily" } });

    await userEvent.click(screen.getByText(m.journal_prompt_section_title()));

    const questionEl = await screen.findByText(moodPrompt.question);
    const row = questionEl.closest(".prompt-row");
    expect(row).toBeTruthy();
    const typeFlair = row?.querySelector(".flair");
    expect(typeFlair?.textContent).toBe(m.journal_prompt_type_option({ type: "date" }));
    const rowText = row?.textContent ?? "";
    expect(rowText.indexOf(moodPrompt.question)).toBeGreaterThanOrEqual(0);
    expect(rowText.indexOf(moodPrompt.question)).toBeLessThan(rowText.indexOf(moodPrompt.variable));
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

  describe("addressing a notelet type", () => {
    const seed = {
      journals: {
        Work: fixedJournal(
          "Work",
          { type: "day" },
          {
            prompts: [
              {
                type: "text",
                variable: "mood",
                question: "Journal question?",
                frontmatterKey: "mood",
                required: false,
              },
            ],
            notelets: {
              nt_7f3a: buildNoteletType({
                id: "nt_7f3a" as TypeId,
                name: "Standup",
                prompts: [
                  {
                    type: "text",
                    variable: "attendee",
                    question: "Type question?",
                    frontmatterKey: "with",
                    required: false,
                  },
                ],
              }),
            },
          },
        ),
      },
    };

    it("lists the type's questions", async () => {
      const harness = await testContainer({ modules: [journalsCoreModule], data: seed });
      harness.render(PromptsSection, { props: { journalName: "Work", typeId: "nt_7f3a" } });
      await userEvent.click(screen.getByText(m.journal_prompt_section_title()));

      expect(await screen.findByText("Type question?")).toBeTruthy();
      expect(screen.queryByText("Journal question?")).toBeNull();
    });

    it("deletes from the type, not the journal", async () => {
      const harness = await testContainer({ modules: [journalsCoreModule], data: seed });
      harness.render(PromptsSection, { props: { journalName: "Work", typeId: "nt_7f3a" } });
      await userEvent.click(screen.getByText(m.journal_prompt_section_title()));

      await userEvent.click(await screen.findByLabelText(m.journal_prompt_delete()));

      await waitFor(() => {
        const config = harness.resolve(JournalsRepository).get("Work").getOrUndefined();
        expect(config?.notelets.nt_7f3a?.prompts).toHaveLength(0);
        expect(config?.prompts).toHaveLength(1);
      });
    });

    it("still lists the journal's questions with no type", async () => {
      const harness = await testContainer({ modules: [journalsCoreModule], data: seed });
      harness.render(PromptsSection, { props: { journalName: "Work" } });
      await userEvent.click(screen.getByText(m.journal_prompt_section_title()));

      expect(await screen.findByText("Journal question?")).toBeTruthy();
    });
  });
});
