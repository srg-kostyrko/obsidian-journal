import { describe, expect, it } from "vitest";
import { defineComponent, ref, type Ref } from "vue";

import type { AnchorString } from "@/calendar";
import { JournalsRepository } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { customJournal, fixedJournal } from "@/journals/testing";
import { testContainer, type TestHarness } from "@/testing";

import { useInvertibilityCheck } from "./use-invertibility-check";

import type { JournalConfig } from "../../config";
import type { Prompt } from "../../prompts/config";

const moodPrompt: Prompt = { variable: "mood", question: "?", type: "text", frontmatterKey: "mood", required: false };
const ratingPrompt: Prompt = {
  variable: "rating",
  question: "?",
  type: "number",
  frontmatterKey: "rating",
  required: false,
};
const loggedAtPrompt: Prompt = {
  variable: "logged_at",
  question: "?",
  type: "date",
  frontmatterKey: "logged_at",
  required: false,
};
const weatherPrompt: Prompt = {
  variable: "weather",
  question: "?",
  type: "select",
  frontmatterKey: "weather",
  required: false,
  options: [
    { label: "Sunny", value: "sunny" },
    { label: "Rainy", value: "rainy" },
  ],
};

function probe(harness: TestHarness, journalName: string): Ref<unknown> {
  const journal = ref(harness.resolve(JournalsRepository).get(journalName).getOrUndefined());
  let captured: Ref<unknown> | undefined;
  const Probe = defineComponent({
    setup() {
      captured = useInvertibilityCheck(journal);
      return undefined;
    },
    template: "<div />",
  });
  harness.render(Probe);
  if (!captured) throw new Error("probe did not capture the warning ref");
  return captured;
}

function withName(nameTemplate: string): JournalConfig {
  return fixedJournal("daily", { type: "day" }, { nameTemplate });
}

describe("useInvertibilityCheck", () => {
  it("returns null for an invertible template with only known variables", async () => {
    const config = withName("{{date}}-{{journal_name}}");
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toBeNull();
  });

  it("returns null for a static template", async () => {
    const config = withName("static-note");
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toBeNull();
  });

  it("flags a template containing a function token", async () => {
    const config = withName("{{date}}-{{format(YYYY)}}");
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toMatchObject({ kind: "non-invertible", reason: "function-token" });
  });

  it("flags a template containing an unknown variable", async () => {
    const config = withName("{{date}}-{{mystery}}");
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toMatchObject({
      kind: "non-invertible",
      reason: "unknown-variable",
      offending: "mystery",
    });
  });

  it("does not flag a configured numbering variable alongside a date", async () => {
    const config = customJournal("sprints", "week", 1, "2024-01-01", { nameTemplate: "{{date}}-{{index}}" });
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toBeNull();
  });

  it("returns null for an index-only template when the numbering is invertible", async () => {
    const config = customJournal("sprints", "week", 1, "2024-01-01", { nameTemplate: "Sprint {{index}}" });
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toBeNull();
  });

  it("flags a cyclic-top warning for an index-only template when the sole digit is cyclic", async () => {
    const config = customJournal("sprints", "week", 1, "2024-01-01", {
      nameTemplate: "Sprint {{index}}",
      numbering: {
        enabled: true,
        anchorDate: "2024-01-01" as AnchorString,
        allowBefore: false,
        sources: [
          { variable: "index", frontmatterKey: "sprint-number", anchorValue: 1, reset: { kind: "after", count: 3 } },
        ],
      },
    });
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toEqual({ kind: "cyclic-top" });
  });

  it("reports cyclic-top when the most significant digit resets", async () => {
    const config = withName("Q{{quarter}}W{{week}}");
    config.numbering = {
      enabled: true,
      anchorDate: "2026-01-05" as AnchorString,
      allowBefore: false,
      sources: [
        { variable: "quarter", frontmatterKey: "journal-quarter", anchorValue: 1, reset: { kind: "after", count: 4 } },
        { variable: "week", frontmatterKey: "journal-week", anchorValue: 1, reset: { kind: "after", count: 13 } },
      ],
    };
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toEqual({ kind: "cyclic-top" });
  });

  it("reports no warning when every invertible digit appears in the template", async () => {
    const config = withName("Release{{release}}Sprint{{sprint}}");
    config.numbering = {
      enabled: true,
      anchorDate: "2026-01-05" as AnchorString,
      allowBefore: false,
      sources: [
        { variable: "release", frontmatterKey: "journal-release", anchorValue: 4711, reset: { kind: "never" } },
        { variable: "sprint", frontmatterKey: "journal-sprint", anchorValue: 1, reset: { kind: "after", count: 6 } },
      ],
    };
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toBeNull();
  });

  it("names the digits missing from the template", async () => {
    const config = withName("Sprint{{sprint}}");
    config.numbering = {
      enabled: true,
      anchorDate: "2026-01-05" as AnchorString,
      allowBefore: false,
      sources: [
        { variable: "release", frontmatterKey: "journal-release", anchorValue: 4711, reset: { kind: "never" } },
        { variable: "sprint", frontmatterKey: "journal-sprint", anchorValue: 1, reset: { kind: "after", count: 6 } },
      ],
    };
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toEqual({ kind: "unused-digits", missing: ["release"] });
  });

  it("counts a digit used only in the folder as present", async () => {
    const config = fixedJournal("daily", { type: "day" }, { nameTemplate: "Sprint{{sprint}}", folder: "R{{release}}" });
    config.numbering = {
      enabled: true,
      anchorDate: "2026-01-05" as AnchorString,
      allowBefore: false,
      sources: [
        { variable: "release", frontmatterKey: "journal-release", anchorValue: 4711, reset: { kind: "never" } },
        { variable: "sprint", frontmatterKey: "journal-sprint", anchorValue: 1, reset: { kind: "after", count: 6 } },
      ],
    };
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toBeNull();
  });

  it("names the digit that emits no carry", async () => {
    const config = withName("Release{{release}}Sprint{{sprint}}");
    config.numbering = {
      enabled: true,
      anchorDate: "2026-01-05" as AnchorString,
      allowBefore: false,
      sources: [
        { variable: "release", frontmatterKey: "journal-release", anchorValue: 4711, reset: { kind: "never" } },
        { variable: "sprint", frontmatterKey: "journal-sprint", anchorValue: 1, reset: { kind: "never" } },
      ],
    };
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toEqual({ kind: "no-carry", offending: "sprint" });
  });

  it("reports the cyclic first digit ahead of a lower digit that emits no carry", async () => {
    const config = withName("Release{{release}}Sprint{{sprint}}");
    config.numbering = {
      enabled: true,
      anchorDate: "2026-01-05" as AnchorString,
      allowBefore: false,
      sources: [
        { variable: "release", frontmatterKey: "journal-release", anchorValue: 1, reset: { kind: "after", count: 4 } },
        { variable: "sprint", frontmatterKey: "journal-sprint", anchorValue: 1, reset: { kind: "never" } },
      ],
    };
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toEqual({ kind: "cyclic-top" });
  });

  it("stays silent while sequential numbers are turned off", async () => {
    const config = withName("Sprint{{sprint}}");
    config.numbering = {
      enabled: false,
      anchorDate: "2026-01-05" as AnchorString,
      allowBefore: false,
      sources: [
        { variable: "release", frontmatterKey: "journal-release", anchorValue: 4711, reset: { kind: "never" } },
        { variable: "sprint", frontmatterKey: "journal-sprint", anchorValue: 1, reset: { kind: "after", count: 6 } },
      ],
    };
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toBeNull();
  });

  it("reports the cyclic first digit behind a date variable too coarse to pin the period", async () => {
    const config = customJournal("sprints", "week", 2, "2026-01-05", {
      nameTemplate: "{{date:YYYY}}-S{{sprint}}",
      numbering: {
        enabled: true,
        anchorDate: "2026-01-05" as AnchorString,
        allowBefore: false,
        sources: [
          { variable: "sprint", frontmatterKey: "journal-sprint", anchorValue: 1, reset: { kind: "after", count: 3 } },
        ],
      },
    });
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toEqual({ kind: "cyclic-top" });
  });

  it("stays silent when the numbering identifies the period a coarse date variable cannot", async () => {
    const config = customJournal("sprints", "week", 2, "2026-01-05", {
      nameTemplate: "{{date:YYYY}}-C{{cycle}}-S{{sprint}}",
      numbering: {
        enabled: true,
        anchorDate: "2026-01-05" as AnchorString,
        allowBefore: false,
        sources: [
          { variable: "cycle", frontmatterKey: "journal-cycle", anchorValue: 1, reset: { kind: "never" } },
          { variable: "sprint", frontmatterKey: "journal-sprint", anchorValue: 1, reset: { kind: "after", count: 3 } },
        ],
      },
    });
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toBeNull();
  });

  it("flags a date variable too coarse to tell the periods apart when nothing numbers the notes", async () => {
    const config = customJournal("sprints", "week", 2, "2026-01-05", {
      nameTemplate: "{{date:YYYY}}",
      numbering: { enabled: false, anchorDate: "2026-01-05" as AnchorString, allowBefore: false, sources: [] },
    });
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toEqual({ kind: "coarse-date" });
  });

  it("flags a coarse date variable when the numbering runs but names no digit in the path", async () => {
    const config = customJournal("sprints", "week", 2, "2026-01-05", {
      nameTemplate: "{{date:YYYY}}",
      numbering: {
        enabled: true,
        anchorDate: "2026-01-05" as AnchorString,
        allowBefore: false,
        sources: [{ variable: "sprint", frontmatterKey: "journal-sprint", anchorValue: 1, reset: { kind: "never" } }],
      },
    });
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toEqual({ kind: "coarse-date" });
  });

  it("stays silent for a static name, which names no date to be too coarse", async () => {
    const config = customJournal("sprints", "week", 2, "2026-01-05", {
      nameTemplate: "static-note",
      numbering: { enabled: false, anchorDate: "2026-01-05" as AnchorString, allowBefore: false, sources: [] },
    });
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toBeNull();
  });

  it("does not report a prompted template as having an unknown variable", async () => {
    const config = withName("{{date}}-{{mood}}");
    config.prompts = [moodPrompt];
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).not.toMatchObject({
      kind: "non-invertible",
      reason: "unknown-variable",
    });
  });

  it("reports a text prompt in the note name as non-invertible", async () => {
    const config = withName("{{date}}-{{mood}}");
    config.prompts = [moodPrompt];
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toEqual({ kind: "text-prompt-in-path", offending: "mood" });
  });

  it("reports a text prompt in the folder, not just the note name, as non-invertible", async () => {
    const config = fixedJournal("daily", { type: "day" }, { nameTemplate: "{{date}}", folder: "{{mood}}" });
    config.prompts = [moodPrompt];
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toEqual({ kind: "text-prompt-in-path", offending: "mood" });
  });

  it("accepts a select prompt in the note name", async () => {
    const config = withName("{{date}}-{{weather}}");
    config.prompts = [weatherPrompt];
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toBeNull();
  });

  it("accepts a number prompt in the note name", async () => {
    const config = withName("{{date}}-{{rating}}");
    config.prompts = [ratingPrompt];
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toBeNull();
  });

  it("accepts a date prompt in the note name", async () => {
    const config = withName("{{date}}-{{logged_at}}");
    config.prompts = [loggedAtPrompt];
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toBeNull();
  });

  it("stays silent when a cyclic digit completes a coarse date exactly", async () => {
    const config = fixedJournal(
      "monthly",
      { type: "month" },
      {
        nameTemplate: "{{date:YYYY}}-M{{month}}",
        numbering: {
          enabled: true,
          anchorDate: "2026-01-01" as AnchorString,
          allowBefore: false,
          sources: [
            { variable: "month", frontmatterKey: "journal-month", anchorValue: 1, reset: { kind: "after", count: 12 } },
          ],
        },
      },
    );
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { [config.name]: config } },
    });

    expect(probe(harness, config.name).value).toBeNull();
  });
});
