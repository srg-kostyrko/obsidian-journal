import { describe, expect, it } from "vitest";

import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { VaultSubscriptionService } from "@/journals/vault-subscription";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";

import { JournalsApiService } from "../../journals-api";
import { apiModule } from "../../module";

import { NoteAdjacentTool } from "./note-adjacent";

const unattended = { prompt: false, confirm: false } as const;

async function build() {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, apiModule],
    data: { journals: { work: fixedJournal("work", { type: "day" }) }, shelves: {} },
    initialize: [VaultSubscriptionService],
  });
  const api = harness.resolve(JournalsApiService);
  await api.ensureNote("work", "2026-09-01", unattended);
  await api.ensureNote("work", "2026-09-10", unattended);
  return { tool: harness.resolve(NoteAdjacentTool) };
}

describe("NoteAdjacentTool", () => {
  it("finds the nearest earlier note across a gap", async () => {
    const { tool } = await build();

    const result = await tool.call({ journal: "work", date: "2026-09-08", direction: "previous" });

    expect(result).toMatchObject({ note: { date: "2026-09-01", path: "2026-09-01.md" } });
  });

  it("finds the nearest later note across a gap", async () => {
    const { tool } = await build();

    const result = await tool.call({ journal: "work", date: "2026-09-02", direction: "next" });

    expect(result).toMatchObject({ note: { date: "2026-09-10" } });
  });

  it("answers a null note when there is nothing on that side", async () => {
    const { tool } = await build();

    await expect(tool.call({ journal: "work", date: "2026-09-10", direction: "next" })).resolves.toEqual({
      note: null,
    });
  });

  it("rejects an unknown journal with journal-not-found", async () => {
    const { tool } = await build();

    await expect(tool.call({ journal: "nope", date: "2026-09-10", direction: "next" })).rejects.toMatchObject({
      code: "journal-not-found",
    });
  });
});
