import { describe, expect, it } from "vitest";

import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { VaultSubscriptionService } from "@/journals/vault-subscription";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";

import { JournalsApiService } from "../../journals-api";
import { apiModule } from "../../module";

import { JournalListTool } from "./journal-list";

async function build() {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, apiModule],
    data: { journals: { work: fixedJournal("work", { type: "day" }) }, shelves: {} },
    initialize: [VaultSubscriptionService],
  });
  return { api: harness.resolve(JournalsApiService), tool: harness.resolve(JournalListTool) };
}

describe("JournalListTool", () => {
  it("returns the journal list", async () => {
    const { api, tool } = await build();

    const result = await tool.call({});

    expect(result).toEqual({ journals: await api.listJournals() });
  });

  it("returns a work entry equal to journalInfo(work)", async () => {
    const { api, tool } = await build();

    const result = (await tool.call({})) as { journals: { name: string }[] };

    const work = result.journals.find((journal) => journal.name === "work");
    expect(work).toEqual(await api.journalInfo("work"));
  });
});
