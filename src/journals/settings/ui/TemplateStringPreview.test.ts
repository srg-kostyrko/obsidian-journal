import { screen } from "@testing-library/vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals/journals-index";
import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import { PROMPT_PLACEHOLDER } from "@/journals/prompts/placeholder";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import TemplateStringPreview from "./TemplateStringPreview.vue";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-05-19T12:00:00"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("TemplateStringPreview", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
  });

  it("renders the resolved value when it contains a variable", () => {
    harness.render(TemplateStringPreview, {
      props: { journalName: "daily", value: "{{date:YYYY}}/journal", label: "Preview:" },
    });

    expect(screen.getByText("2026/journal")).toBeTruthy();
    expect(screen.getByText("Preview:")).toBeTruthy();
  });

  it("does not render when the value has no variables", () => {
    const { container: dom } = harness.render(TemplateStringPreview, {
      props: { journalName: "daily", value: "static/folder", label: "Preview:" },
    });

    expect(dom.textContent ?? "").toBe("");
  });
});

describe("TemplateStringPreview for a notelet type", () => {
  const journalPrompt = {
    variable: "mood",
    question: "How do you feel?",
    type: "text",
    frontmatterKey: "journal-mood",
    required: false,
  } as const;

  async function harnessWithType(): Promise<TestHarness> {
    return testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          Work: fixedJournal(
            "Work",
            { type: "day" },
            {
              prompts: [journalPrompt],
              notelets: {
                nt_7f3a: buildNoteletType({
                  id: "nt_7f3a" as TypeId,
                  name: "Standup",
                  prompts: [{ ...journalPrompt, question: "Who was there?", frontmatterKey: "with" }],
                }),
              },
            },
          ),
        },
      },
    });
  }

  it("resolves the counter variable a type's templates may use", async () => {
    const harness = await harnessWithType();

    harness.render(TemplateStringPreview, {
      props: { journalName: "Work", typeId: "nt_7f3a", value: "Standup {{notelet_index}}", label: "Preview:" },
    });

    expect(screen.getByText("Standup 1")).toBeTruthy();
  });

  it("binds the type's own question rather than the period note's answer to it", async () => {
    const harness = await harnessWithType();
    harness.resolve(JournalsIndex).register({
      journalName: "Work",
      anchor: "2026-05-19" as AnchorString,
      path: "Work/2026-05-19.md" as VaultPath,
      answers: { mood: "elated" },
    });

    harness.render(TemplateStringPreview, {
      props: { journalName: "Work", typeId: "nt_7f3a", value: "{{mood}}", label: "Preview:" },
    });

    expect(screen.getByText(PROMPT_PLACEHOLDER)).toBeTruthy();
    expect(screen.queryByText("elated")).toBeNull();
  });

  it("still binds the journal's answer with no type", async () => {
    const harness = await harnessWithType();
    harness.resolve(JournalsIndex).register({
      journalName: "Work",
      anchor: "2026-05-19" as AnchorString,
      path: "Work/2026-05-19.md" as VaultPath,
      answers: { mood: "elated" },
    });

    harness.render(TemplateStringPreview, {
      props: { journalName: "Work", value: "{{mood}}", label: "Preview:" },
    });

    expect(screen.getByText("elated")).toBeTruthy();
  });
});
