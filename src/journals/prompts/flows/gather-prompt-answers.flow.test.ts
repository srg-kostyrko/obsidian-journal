import { describe, expect, it } from "vitest";
import { nextTick } from "vue";

import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import { buildNoteletMetadata, buildNoteletType, customJournal, fixedJournal } from "@/journals/testing";
import { testContainer } from "@/testing";

import { GatherPromptAnswersFlow } from "./gather-prompt-answers.flow";

import type { Prompt, PromptAnswer } from "../config";

const mood: Prompt = { variable: "mood", question: "Mood?", type: "text", frontmatterKey: "mood", required: false };

describe("GatherPromptAnswersFlow", () => {
  it("returns the answers submitted through the modal", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { mood: fixedJournal("mood", { type: "day" }, { prompts: [mood] }) } },
    });

    const promise = harness.resolve(Flows).invoke(GatherPromptAnswersFlow, {
      metadata: { journalName: "mood", anchor: anchor("2024-01-01") },
      confirming: false,
    });
    harness.modals.lastOpen<unknown, Record<string, PromptAnswer>>().submit({ mood: "good" });
    const result = await promise;

    expect(result.isOk() && result.value).toEqual({ mood: "good" });
  });

  it("passes the given metadata, confirming and the period's own label as the modal's props", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { mood: fixedJournal("mood", { type: "day" }, { prompts: [mood] }) } },
    });

    void harness.resolve(Flows).invoke(GatherPromptAnswersFlow, {
      metadata: { journalName: "mood", anchor: anchor("2024-01-01") },
      confirming: true,
    });

    expect(harness.modals.lastOpen().props).toEqual({
      metadata: { journalName: "mood", anchor: anchor("2024-01-01") },
      confirming: true,
      periodLabel: "2024-01-01",
    });
  });

  it("titles the modal by the journal being written to", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { mood: fixedJournal("mood", { type: "day" }, { prompts: [mood] }) } },
    });

    void harness.resolve(Flows).invoke(GatherPromptAnswersFlow, {
      metadata: { journalName: "mood", anchor: anchor("2024-01-01") },
      confirming: false,
    });

    expect(harness.modals.lastOpen().resolvedTitle).toBe(m.journal_prompt_answers_modal_title({ journal: "mood" }));
  });

  // The numbers are what the note name renders {{index}} from, so the flow must forward the
  // given metadata to the modal unchanged rather than rebuilding it from journalName and anchor
  // alone, which would drop them.
  it("passes the given metadata's assigned numbers through to the modal unchanged", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { sprint: customJournal("sprint", "week", 2, "2024-01-01", { prompts: [mood] }) } },
    });

    void harness.resolve(Flows).invoke(GatherPromptAnswersFlow, {
      metadata: { journalName: "sprint", anchor: anchor("2024-01-15"), numbers: { index: 2 } },
      confirming: false,
    });

    expect(harness.modals.lastOpen().props).toMatchObject({ metadata: { numbers: { index: 2 } } });
  });

  it("passes notelet metadata through to the modal", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          Work: fixedJournal(
            "Work",
            { type: "day" },
            { notelets: { nt_7f3a: buildNoteletType({ id: "nt_7f3a" as TypeId, name: "Standup" }) } },
          ),
        },
      },
    });
    const metadata = buildNoteletMetadata({ journalName: "Work", typeId: "nt_7f3a" as TypeId });

    void harness.resolve(Flows).invoke(GatherPromptAnswersFlow, { metadata, confirming: false });
    await nextTick();

    expect(harness.modals.lastOpen()?.props).toMatchObject({ metadata });
  });

  it("returns UserAborted when the modal is cancelled", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { mood: fixedJournal("mood", { type: "day" }, { prompts: [mood] }) } },
    });

    const promise = harness.resolve(Flows).invoke(GatherPromptAnswersFlow, {
      metadata: { journalName: "mood", anchor: anchor("2024-01-01") },
      confirming: false,
    });
    harness.modals.lastOpen().cancel();
    const result = await promise;

    expect(result.isErr() && result.error).toBeInstanceOf(UserAborted);
  });

  it("errors for an unknown journal without opening a modal", async () => {
    const harness = await testContainer({ modules: [journalsCoreModule] });

    const result = await harness.resolve(Flows).invoke(GatherPromptAnswersFlow, {
      metadata: { journalName: "missing", anchor: anchor("2024-01-01") },
      confirming: false,
    });

    expect(result.isErr()).toBe(true);
    expect(harness.modals.opens).toHaveLength(0);
  });
});
