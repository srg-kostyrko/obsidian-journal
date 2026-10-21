import { TFile } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import type { Module } from "@/infrastructure/di";
import { UserAborted } from "@/infrastructure/flows";
import type { VaultPath } from "@/infrastructure/host";
import { AsyncResult } from "@/infrastructure/result";
import { JournalsIndex } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import { overrideWith, testContainer, type TestHarness } from "@/testing";

import { tasksCoreModule } from "../module";

import { NoCurrentPeriodError } from "./errors";
import { rollNotice, type RollReport } from "./report";
import { RolloverCommands } from "./rollover-commands";
import { RolloverService } from "./rollover-service";

const DAILY = "daily/2026-10-21.md" as VaultPath;
const NOTELET = "daily/standup.md" as VaultPath;
const ORPHAN = "notes/orphan.md" as VaultPath;

const REPORT: RollReport = {
  journalName: "daily",
  mode: "copy",
  rolled: 2,
  notes: 1,
  sources: [anchor("2026-10-20")],
  read: [anchor("2026-10-20")],
  noPrevious: false,
  noTarget: false,
  missingHeading: [],
  heading: null,
  skippedNoteItems: 0,
  skippedBlockIds: 0,
  skippedNoteItemsAt: [],
  skippedBlockIdsAt: [],
  changedSources: [],
  failedSources: [],
  skippedSources: [],
  unreadSources: [],
};

const commandsModule: Module = {
  register(c) {
    c.register(RolloverCommands).useClass(RolloverCommands).eager();
  },
};

describe("RolloverCommands", () => {
  let harness: TestHarness;
  const roll = vi.fn();

  async function boot(journals: Record<string, ReturnType<typeof fixedJournal>>, ready = true): Promise<void> {
    harness = await testContainer({
      modules: [journalsCoreModule, tasksCoreModule, commandsModule],
      data: { journals },
      allow: { hostState: true },
      overrides: [overrideWith(RolloverService, { roll } as never)],
    });
    for (const path of [DAILY, NOTELET, ORPHAN]) harness.host.putFile(path);
    if (ready) scan();
  }

  // What the startup scan does: fill the index, then say it is authoritative.
  function scan(): void {
    const index = harness.resolve(JournalsIndex);
    index.register({ journalName: "daily", anchor: anchor("2026-10-21"), path: DAILY });
    index.register({
      kind: "notelet",
      journalName: "daily",
      anchor: anchor("2026-10-21"),
      path: NOTELET,
      typeName: "Standup",
      typeId: null,
    });
    index.markReady();
  }

  function setActive(path: VaultPath | null): void {
    const file = path ? harness.host.app.vault.getAbstractFileByPath(path) : null;
    harness.host.emitActiveLeafChange(file instanceof TFile ? file : null);
  }

  function run(): void {
    harness.host.commands.get("roll-over")?.checkCallback?.(false);
  }

  beforeEach(async () => {
    roll.mockReset();
    roll.mockReturnValue(AsyncResult.ok(REPORT));
    await boot({ daily: fixedJournal("daily", { type: "day" }), weekly: fixedJournal("weekly", { type: "week" }) });
  });

  it("is always listed in the palette", () => {
    setActive(ORPHAN);
    expect(harness.host.commands.get("roll-over")?.checkCallback?.(true)).toBe(true);
  });

  it("from a journal note it rolls that journal and shows the report", async () => {
    setActive(DAILY);
    run();
    await vi.waitFor(() => expect(harness.notices.messages).toContain(rollNotice(REPORT)));
    expect(roll).toHaveBeenCalledWith("daily", { interactive: true });
    expect(harness.suggests.opens.length).toBe(0);
  });

  it("a press before the startup scan waits for the index, then rolls the open note's journal", async () => {
    await boot(
      { daily: fixedJournal("daily", { type: "day" }), weekly: fixedJournal("weekly", { type: "week" }) },
      false,
    );
    setActive(DAILY);
    run();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(roll).not.toHaveBeenCalled();
    expect(harness.suggests.opens.length).toBe(0);
    expect(harness.notices.messages).toEqual([]);

    setActive(ORPHAN);
    scan();

    await vi.waitFor(() => expect(roll).toHaveBeenCalledWith("daily", { interactive: true }));
    expect(harness.suggests.opens.length).toBe(0);
    await vi.waitFor(() => expect(harness.notices.messages).toContain(rollNotice(REPORT)));
  });

  it("from a notelet it rolls the notelet's journal", async () => {
    setActive(NOTELET);
    run();
    await vi.waitFor(() => expect(roll).toHaveBeenCalledWith("daily", { interactive: true }));
  });

  it("from a non-journal note it asks which journal", async () => {
    setActive(ORPHAN);
    run();
    await vi.waitFor(() => expect(harness.suggests.opens.length).toBe(1));
    expect(harness.suggests.lastOpen<string[], string>().input).toEqual(["daily", "weekly"]);
    harness.suggests.lastOpen<string[], string>().choose("weekly");
    await vi.waitFor(() => expect(roll).toHaveBeenCalledWith("weekly", { interactive: true }));
    await vi.waitFor(() => expect(harness.notices.messages).toContain(rollNotice(REPORT)));
  });

  it("a cancelled pick shows nothing", async () => {
    setActive(ORPHAN);
    run();
    await vi.waitFor(() => expect(harness.suggests.opens.length).toBe(1));
    harness.suggests.lastOpen<string[], string>().cancel();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(roll).not.toHaveBeenCalled();
    expect(harness.notices.messages).toEqual([]);
  });

  it("says so when there are no journals", async () => {
    await boot({});
    setActive(ORPHAN);
    run();
    await vi.waitFor(() => expect(harness.notices.messages).toContain(m.common_no_journals_yet()));
    expect(harness.suggests.opens.length).toBe(0);
  });

  it("shows nothing when the interactive roll was aborted", async () => {
    roll.mockReturnValue(AsyncResult.err(new UserAborted("confirm-creation")));
    setActive(DAILY);
    run();
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(harness.notices.messages).toEqual([]);
  });

  it("explains a journal whose timeline does not reach today", async () => {
    roll.mockReturnValue(AsyncResult.err(new NoCurrentPeriodError("daily")));
    setActive(DAILY);
    run();
    await vi.waitFor(() => expect(harness.notices.messages).toContain(m.tasks_roll_no_current_period()));
  });

  it("reports any other failure as a failed roll", async () => {
    roll.mockReturnValue(AsyncResult.err(new Error("boom")));
    setActive(DAILY);
    run();
    await vi.waitFor(() => expect(harness.notices.messages).toContain(m.tasks_roll_failed()));
  });
});
