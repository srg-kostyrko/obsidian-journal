import { beforeEach, describe, it, expect } from "vitest";

import { anchor } from "@/calendar/testing";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { testContainer, type TestHarness } from "@/testing";

import { journalsCoreModule } from "../module";
import { fixedJournal } from "../testing";

import { OpenJournalEntryFlow } from "./open-journal-entry.flow";

describe("OpenJournalEntryFlow — cursor jump", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });
  });

  it("jumps the cursor after opening a newly created note", async () => {
    await harness.resolve(Flows).invoke(OpenJournalEntryFlow, { journalName: "daily", anchor: anchor("2026-05-19") });
    expect(harness.templater.cursorJumps).toEqual(["2026-05-19.md"]);
  });

  it("does not jump the cursor when the note already existed", async () => {
    harness.host.putFile("2026-05-19.md", "existing");

    await harness.resolve(Flows).invoke(OpenJournalEntryFlow, { journalName: "daily", anchor: anchor("2026-05-19") });
    expect(harness.templater.cursorJumps).toEqual([]);
  });
});

describe("OpenJournalEntryFlow", () => {
  it("ensures the note and opens it in the workspace", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
    });

    const result = await harness
      .resolve(Flows)
      .invoke(OpenJournalEntryFlow, { journalName: "daily", anchor: anchor("2026-05-19") });

    expect(result.isOk()).toBe(true);
    expect(harness.resolve(WorkspaceService).isOpen("2026-05-19.md" as VaultPath)).toBe(true);
  });

  it("does not open the workspace when ensureNote returns UserAborted", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }, { confirmCreation: true }) } },
    });

    const promise = harness
      .resolve(Flows)
      .invoke(OpenJournalEntryFlow, { journalName: "daily", anchor: anchor("2026-05-19") });
    await Promise.resolve();
    await Promise.resolve();
    harness.modals.lastOpen<{ journalName: string; noteName: string }, boolean>().cancel();
    const result = await promise;

    expect(result.isErr() && result.error instanceof UserAborted).toBe(true);
    expect(harness.resolve(WorkspaceService).isOpen("2026-05-19.md" as VaultPath)).toBe(false);
  });
});
