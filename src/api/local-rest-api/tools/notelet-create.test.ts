import { describe, expect, it } from "vitest";

import { journalsCoreModule } from "@/journals/module";
import type { TypeId } from "@/journals/notelets/config";
import { buildNoteletType, fixedJournal } from "@/journals/testing";
import { VaultSubscriptionService } from "@/journals/vault-subscription";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";

import { JournalsApiService } from "../../journals-api";
import { apiModule } from "../../module";

import { NoteletCreateTool } from "./notelet-create";

const journals = {
  work: fixedJournal(
    "work",
    { type: "day" },
    { notelets: { nt_mood: buildNoteletType({ id: "nt_mood" as TypeId, name: "mood" }) } },
  ),
};

async function build() {
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
});
