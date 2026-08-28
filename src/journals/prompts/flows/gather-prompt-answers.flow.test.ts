import { describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
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

    const promise = harness
      .resolve(Flows)
      .invoke(GatherPromptAnswersFlow, { journalName: "mood", anchor: anchor("2024-01-01"), confirming: false });
    harness.modals.lastOpen<unknown, Record<string, PromptAnswer>>().submit({ mood: "good" });
    const result = await promise;

    expect(result.isOk() && result.value).toEqual({ mood: "good" });
  });

  it("passes journalName, anchor, confirming and the period's own label as the modal's props", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { mood: fixedJournal("mood", { type: "day" }, { prompts: [mood] }) } },
    });

    void harness
      .resolve(Flows)
      .invoke(GatherPromptAnswersFlow, { journalName: "mood", anchor: anchor("2024-01-01"), confirming: true });

    expect(harness.modals.lastOpen().props).toEqual({
      journalName: "mood",
      anchor: anchor("2024-01-01"),
      confirming: true,
      periodLabel: "2024-01-01",
    });
  });

  it("returns UserAborted when the modal is cancelled", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { mood: fixedJournal("mood", { type: "day" }, { prompts: [mood] }) } },
    });

    const promise = harness
      .resolve(Flows)
      .invoke(GatherPromptAnswersFlow, { journalName: "mood", anchor: anchor("2024-01-01"), confirming: false });
    harness.modals.lastOpen().cancel();
    const result = await promise;

    expect(result.isErr() && result.error).toBeInstanceOf(UserAborted);
  });

  it("errors for an unknown journal without opening a modal", async () => {
    const harness = await testContainer({ modules: [journalsCoreModule] });

    const result = await harness
      .resolve(Flows)
      .invoke(GatherPromptAnswersFlow, { journalName: "missing", anchor: anchor("2024-01-01"), confirming: false });

    expect(result.isErr()).toBe(true);
    expect(harness.modals.opens).toHaveLength(0);
  });
});
