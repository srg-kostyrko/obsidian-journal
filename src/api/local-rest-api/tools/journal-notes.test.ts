import { describe, expect, it } from "vitest";

import type { JournalConfig } from "@/journals/config";
import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { VaultSubscriptionService } from "@/journals/vault-subscription";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";

import { JournalsApiService } from "../../journals-api";
import { apiModule } from "../../module";

import { JournalNotesTool } from "./journal-notes";

const unattended = { prompt: false, confirm: false } as const;

function journalWithTwoNoteletTypes() {
  return {
    work: fixedJournal(
      "work",
      { type: "day" },
      {
        notelets: {
          nt_mood: buildNoteletType({ id: "nt_mood" as TypeId, name: "mood" }),
          nt_task: buildNoteletType({ id: "nt_task" as TypeId, name: "task" }),
        },
      },
    ),
  };
}

const defaultJournals: Record<string, JournalConfig> = { work: fixedJournal("work", { type: "day" }) };

async function build(journals: Record<string, JournalConfig> = defaultJournals) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, apiModule],
    data: { journals, shelves: {} },
    initialize: [VaultSubscriptionService],
  });
  return { api: harness.resolve(JournalsApiService), tool: harness.resolve(JournalNotesTool) };
}

describe("JournalNotesTool", () => {
  it("finds a note seeded on the single from date", async () => {
    const { api, tool } = await build();
    await api.ensureNote("work", "2026-09-10", unattended);

    const result = (await tool.call({ journal: "work", from: "2026-09-10" })) as { notes: { path: string }[] };

    expect(result.notes).toMatchObject([{ path: "2026-09-10.md" }]);
  });

  it("does not find the note when from names a different date", async () => {
    const { api, tool } = await build();
    await api.ensureNote("work", "2026-09-10", unattended);

    const result = (await tool.call({ journal: "work", from: "2026-09-11" })) as { notes: unknown[] };

    expect(result.notes).toEqual([]);
  });

  it("filters notelets by type, leaving the non-matching one out", async () => {
    const { api, tool } = await build(journalWithTwoNoteletTypes());
    await api.createNotelet("work", "2026-09-10", "mood", unattended);
    await api.createNotelet("work", "2026-09-10", "task", unattended);

    const result = (await tool.call({ journal: "work", from: "2026-09-10", type: "mood" })) as {
      notelets: { type: string }[];
    };

    expect(result.notelets).toMatchObject([{ type: "mood" }]);
  });

  it("rejects an unknown journal with journal-not-found", async () => {
    const { tool } = await build();

    await expect(tool.call({ journal: "nope", from: "2026-09-10" })).rejects.toMatchObject({
      code: "journal-not-found",
    });
  });
});
