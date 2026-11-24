import { assert, beforeEach, describe, it, expect, vi } from "vitest";

import { userDateFormat } from "@/calendar";
import { anchor, withoutEras } from "@/calendar/testing";
import { m } from "@/i18n";
import { Flows, UserAborted } from "@/infrastructure/flows";
import { WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { testContainer, type TestHarness } from "@/testing";

import { JournalsIndex } from "../journals-index";
import { journalsCoreModule } from "../module";
import { JournalDateFormatError } from "../notes/errors";
import { fixedJournal } from "../testing";

import { OpenJournalEntryFlow } from "./open-journal-entry.flow";

import type { Prompt } from "../prompts/config";

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
    await vi.waitFor(() => expect(harness.modals.opens).toHaveLength(1));
    harness.modals.lastOpen<{ journalName: string; noteName: string }, boolean>().cancel();
    const result = await promise;

    expect(result.isErr() && result.error instanceof UserAborted).toBe(true);
    expect(harness.resolve(WorkspaceService).isOpen("2026-05-19.md" as VaultPath)).toBe(false);
  });
});

describe("OpenJournalEntryFlow — pinned", () => {
  const YESTERDAY = "2026-05-18.md" as VaultPath;
  const WORK_YESTERDAY = "work/2026-05-18.md" as VaultPath;
  const STANDUP = "Standup.md" as VaultPath;

  async function withPinnedTabs(): Promise<TestHarness> {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          daily: fixedJournal("daily", { type: "day" }),
          work: fixedJournal("work", { type: "day" }, { folder: "work" }),
        },
      },
    });
    const index = harness.resolve(JournalsIndex);
    index.register({ journalName: "daily", anchor: anchor("2026-05-18"), path: YESTERDAY });
    index.register({ journalName: "work", anchor: anchor("2026-05-18"), path: WORK_YESTERDAY });
    index.register({
      kind: "notelet",
      journalName: "daily",
      anchor: anchor("2026-05-18"),
      path: STANDUP,
      typeName: "Standup",
      typeId: null,
    });
    const workspace = harness.resolve(WorkspaceService);
    for (const path of [STANDUP, YESTERDAY, WORK_YESTERDAY]) {
      harness.host.putFile(path, "");
      await workspace.openNote(path);
      harness.host.workspace.pinnedPaths.add(path);
    }
    return harness;
  }

  it("moves the journal's pinned tab to the entry", async () => {
    const harness = await withPinnedTabs();

    await harness
      .resolve(Flows)
      .invoke(OpenJournalEntryFlow, { journalName: "daily", anchor: anchor("2026-05-19"), pinned: true });

    expect(harness.host.workspace.retargetCalls).toEqual([{ from: YESTERDAY, to: "2026-05-19.md" }]);
    expect(harness.host.workspace.pinnedPaths).toEqual(new Set(["2026-05-19.md", WORK_YESTERDAY, STANDUP]));
  });

  it("opens without pinning when pinned is not asked for", async () => {
    const harness = await withPinnedTabs();

    await harness.resolve(Flows).invoke(OpenJournalEntryFlow, { journalName: "daily", anchor: anchor("2026-05-19") });

    expect(harness.host.workspace.retargetCalls).toEqual([]);
    expect(harness.host.workspace.pinnedPaths.has("2026-05-19.md")).toBe(false);
  });
});

describe("OpenJournalEntryFlow — an unrenderable date format", () => {
  it("opening a journal entry with an unrenderable format fails with the journal's notice", async () => {
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: { weekly: fixedJournal("weekly", { type: "week" }, { dateFormat: userDateFormat("YYYYy-[W]w") }) },
      },
    });

    const result = await withoutEras(() =>
      harness.resolve(Flows).invoke(OpenJournalEntryFlow, { journalName: "weekly", anchor: anchor("2026-05-18") }),
    );

    assert(result.isErr() && result.error instanceof JournalDateFormatError, "expected JournalDateFormatError");
    expect(harness.notices.messages).toEqual([
      m.journal_date_format_unrenderable_notice({
        journalName: "weekly",
        format: "YYYYy-[W]w",
        reason: result.error.reason,
      }),
    ]);
    expect([...harness.host.files.keys()].filter((path) => path.endsWith(".md"))).toEqual([]);
  });

  it("names the format, not a missing journal, when a prompt in the path is asked first", async () => {
    const mood: Prompt = { variable: "mood", question: "Mood?", type: "text", frontmatterKey: "mood", required: false };
    const harness = await testContainer({
      modules: [journalsCoreModule],
      data: {
        journals: {
          weekly: fixedJournal(
            "weekly",
            { type: "week" },
            { dateFormat: userDateFormat("YYYYy-[W]w"), nameTemplate: "{{date}} {{mood}}", prompts: [mood] },
          ),
        },
      },
    });

    const result = await withoutEras(() =>
      harness.resolve(Flows).invoke(OpenJournalEntryFlow, { journalName: "weekly", anchor: anchor("2026-05-18") }),
    );

    expect(result.isErr() && result.error instanceof JournalDateFormatError).toBe(true);
    expect(harness.modals.opens).toHaveLength(0);
  });
});
