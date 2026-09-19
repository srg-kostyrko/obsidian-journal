import { describe, expect, it } from "vitest";

import type { JournalConfig } from "@/journals/config";
import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import type { Prompt } from "@/journals/prompts/config";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { VaultSubscriptionService } from "@/journals/vault-subscription";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";

import { JournalsApiService } from "../../journals-api";
import { apiModule } from "../../module";

import { NoteletCreateTool } from "./notelet-create";

const requiredMood: Prompt = {
  variable: "mood",
  question: "Mood?",
  type: "text",
  frontmatterKey: "mood",
  required: true,
};

function journalWithMoodType(prompts: Prompt[] = []): Record<string, JournalConfig> {
  return {
    work: fixedJournal(
      "work",
      { type: "day" },
      { notelets: { nt_mood: buildNoteletType({ id: "nt_mood" as TypeId, name: "mood", prompts }) } },
    ),
  };
}

async function build(journals: Record<string, JournalConfig> = journalWithMoodType()) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, apiModule],
    data: { journals, shelves: {} },
    initialize: [VaultSubscriptionService],
  });
  return { api: harness.resolve(JournalsApiService), tool: harness.resolve(NoteletCreateTool) };
}

describe("NoteletCreateTool", () => {
  it("creates two notelets with distinct paths", async () => {
    const { tool } = await build();

    const first = (await tool.call({ journal: "work", date: "2026-09-10", type: "mood" })) as { path: string };
    const second = (await tool.call({ journal: "work", date: "2026-09-10", type: "mood" })) as { path: string };

    expect(first.path).not.toBe(second.path);
  });

  it("rejects an unknown notelet type with notelet-type-not-found", async () => {
    const { tool } = await build();

    await expect(tool.call({ journal: "work", date: "2026-09-10", type: "nope" })).rejects.toMatchObject({
      code: "notelet-type-not-found",
    });
  });

  it("rejects an unknown journal with journal-not-found", async () => {
    const { tool } = await build();

    await expect(tool.call({ journal: "nope", date: "2026-09-10", type: "mood" })).rejects.toMatchObject({
      code: "journal-not-found",
    });
  });

  it("rewords prompts-required to point the agent at answers and journal_list", async () => {
    const { tool } = await build(journalWithMoodType([requiredMood]));

    await expect(tool.call({ journal: "work", date: "2026-09-10", type: "mood" })).rejects.toMatchObject({
      code: "prompts-required",
      journal: "work",
      message: expect.stringMatching(/answers.*journal_list/) as unknown,
    });
  });
});
