import { describe, expect, it, vi } from "vitest";

import type { JournalConfig } from "@/journals/config";
import { journalsCoreModule } from "@/journals/module";
import type { Prompt } from "@/journals/prompts/config";
import { fixedJournal } from "@/journals/testing";
import { VaultSubscriptionService } from "@/journals/vault-subscription";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";

import { JournalsApiService } from "../../journals-api";
import { apiModule } from "../../module";

import { NoteEnsureTool } from "./note-ensure";

const mood: Prompt = { variable: "mood", question: "Mood?", type: "text", frontmatterKey: "mood", required: false };

function journalAsking(prompt: Prompt): Record<string, JournalConfig> {
  return { work: fixedJournal("work", { type: "day" }, { prompts: [prompt] }) };
}

const defaultJournals: Record<string, JournalConfig> = { work: fixedJournal("work", { type: "day" }) };

async function build(journals: Record<string, JournalConfig> = defaultJournals) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, apiModule],
    data: { journals, shelves: {} },
    initialize: [VaultSubscriptionService],
  });
  return { api: harness.resolve(JournalsApiService), tool: harness.resolve(NoteEnsureTool) };
}

describe("NoteEnsureTool", () => {
  it("creates the note on the first call and reuses it on the second", async () => {
    const { tool } = await build();

    const first = (await tool.call({ journal: "work", date: "2026-09-10" })) as { created: boolean; path: string };
    const second = (await tool.call({ journal: "work", date: "2026-09-10" })) as { created: boolean; path: string };

    expect(first).toMatchObject({ created: true, path: "2026-09-10.md" });
    expect(second).toMatchObject({ created: false, path: "2026-09-10.md" });
  });

  it("rejects with prompts-required when a required question has no answer", async () => {
    const { tool } = await build(journalAsking({ ...mood, required: true }));

    await expect(tool.call({ journal: "work", date: "2026-09-10" })).rejects.toMatchObject({
      code: "prompts-required",
    });
  });

  it("rejects with invalid-answers and issues for a bad answer", async () => {
    const { tool } = await build(journalAsking(mood));

    await expect(
      tool.call({ journal: "work", date: "2026-09-10", answers: { unknownVariable: "x" } }),
    ).rejects.toMatchObject({ code: "invalid-answers", issues: expect.any(Array) as unknown });
  });

  it("forwards omitted answers to the API as undefined", async () => {
    const { api, tool } = await build();
    const ensureNote = vi.spyOn(api, "ensureNote");

    await tool.call({ journal: "work", date: "2026-09-10" });

    expect(ensureNote).toHaveBeenCalledWith("work", "2026-09-10", {
      prompt: false,
      confirm: false,
      answers: undefined,
    });
  });

  it("rejects an unknown journal with journal-not-found", async () => {
    const { tool } = await build();

    await expect(tool.call({ journal: "nope", date: "2026-09-10" })).rejects.toMatchObject({
      code: "journal-not-found",
    });
  });
});
