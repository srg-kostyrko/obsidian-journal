import { describe, expect, it, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import { WorkspaceService, type VaultPath } from "@/infrastructure/host";
import { JournalsIndex, VaultSubscriptionService } from "@/journals";
import type { JournalConfig } from "@/journals";
import { journalsCoreModule } from "@/journals/module";
import { fixedJournal } from "@/journals/testing";
import type { ShelfConfig } from "@/shelves";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { testContainer } from "@/testing";

import { commandsModule } from "./module";

const DAY_NOTE = "2026-05-04.md" as VaultPath;
const MONTH_NOTE = "2026-05.md" as VaultPath;
const ORPHAN = "orphan.md" as VaultPath;

const daily = fixedJournal("daily", { type: "day" });
const monthly = fixedJournal("monthly", { type: "month" });
const LATER = anchor("2027-01-01");

interface ZoomSeed {
  readonly journals?: Record<string, JournalConfig>;
  readonly shelves?: Record<string, ShelfConfig>;
}

// The subject IS the host registration, so this is a full-module boot with allow.hostState,
// the same shape DynamicCommandRegistry's own tests use.
async function buildZoom(seed: ZoomSeed = {}) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, commandsModule],
    data: { journals: seed.journals ?? {}, shelves: seed.shelves ?? {}, commands: {} },
    allow: { hostState: true },
    initialize: [VaultSubscriptionService],
  });
  return {
    harness,
    host: harness.host,
    notices: harness.notices,
    suggests: harness.suggests,
    index: harness.resolve(JournalsIndex),
    workspace: harness.resolve(WorkspaceService),
  };
}

describe("ZoomCommands", () => {
  it("lists the longer-period command while a journal note is active", async () => {
    const { host, index } = await buildZoom({ journals: { daily, monthly } });
    index.register({ journalName: "daily", anchor: anchor("2026-05-04"), path: DAY_NOTE });
    host.emitActiveLeafChange(host.putFile(DAY_NOTE));

    expect(host.commands.get("zoom-out")?.checkCallback?.(true)).toBe(true);
  });

  it("hides the longer-period command when no journal in scope is longer", async () => {
    const { host, index } = await buildZoom({ journals: { daily } });
    index.register({ journalName: "daily", anchor: anchor("2026-05-04"), path: DAY_NOTE });
    host.emitActiveLeafChange(host.putFile(DAY_NOTE));

    expect(host.commands.get("zoom-out")?.checkCallback?.(true)).toBe(false);
    expect(host.commands.get("zoom-in")?.checkCallback?.(true)).toBe(false);
  });

  it("hides both commands when the active note belongs to no journal", async () => {
    const { host } = await buildZoom({ journals: { daily, monthly } });
    host.emitActiveLeafChange(host.putFile(ORPHAN));

    expect(host.commands.get("zoom-out")?.checkCallback?.(true)).toBe(false);
    expect(host.commands.get("zoom-in")?.checkCallback?.(true)).toBe(false);
  });

  it("opens the longer-period note covering the active note's date", async () => {
    const { host, index, workspace } = await buildZoom({ journals: { daily, monthly } });
    index.register({ journalName: "daily", anchor: anchor("2026-05-04"), path: DAY_NOTE });
    index.register({ journalName: "monthly", anchor: anchor("2026-05-01"), path: MONTH_NOTE });
    host.emitActiveLeafChange(host.putFile(DAY_NOTE));

    host.commands.get("zoom-out")?.checkCallback?.(false);

    await vi.waitFor(() => expect(workspace.isOpen(MONTH_NOTE)).toBe(true));
  });

  it("opens the shorter-period note at the start of the active period", async () => {
    const { host, index, workspace } = await buildZoom({ journals: { daily, monthly } });
    const start = "2026-05-01.md" as VaultPath;
    index.register({ journalName: "monthly", anchor: anchor("2026-05-01"), path: MONTH_NOTE });
    index.register({ journalName: "daily", anchor: anchor("2026-05-01"), path: start });
    host.emitActiveLeafChange(host.putFile(MONTH_NOTE));

    host.commands.get("zoom-in")?.checkCallback?.(false);

    await vi.waitFor(() => expect(workspace.isOpen(start)).toBe(true));
  });

  it("creates the longer-period note when it does not exist yet", async () => {
    const { host, index } = await buildZoom({ journals: { daily, monthly } });
    index.register({ journalName: "daily", anchor: anchor("2026-05-04"), path: DAY_NOTE });
    host.emitActiveLeafChange(host.putFile(DAY_NOTE));

    host.commands.get("zoom-out")?.checkCallback?.(false);

    await vi.waitFor(() => expect(host.app.vault.getAbstractFileByPath(MONTH_NOTE)).not.toBeNull());
  });

  it("passes over a longer journal whose timeline does not reach the active note's date", async () => {
    // OpenDateFlow drops an out-of-timeline journal on its own and answers NoApplicableJournals,
    // which the flow layer logs and shows nothing for — so the walk has to skip it here instead,
    // or the command lists, runs, and does nothing.
    const laterWeekly = fixedJournal(
      "weekly",
      { type: "week" },
      { timeline: { start: LATER, end: { kind: "never" } } },
    );
    const { host, index, workspace } = await buildZoom({ journals: { daily, weekly: laterWeekly, monthly } });
    index.register({ journalName: "daily", anchor: anchor("2026-05-04"), path: DAY_NOTE });
    index.register({ journalName: "monthly", anchor: anchor("2026-05-01"), path: MONTH_NOTE });
    host.putFile(DAY_NOTE);
    host.putFile(MONTH_NOTE);
    host.emitActiveLeafChange(host.putFile(DAY_NOTE));

    host.commands.get("zoom-out")?.checkCallback?.(false);

    await vi.waitFor(() => expect(workspace.isOpen(MONTH_NOTE)).toBe(true));
  });

  it("hides the command when the only longer journal cannot cover the active note's date", async () => {
    const laterWeekly = fixedJournal(
      "weekly",
      { type: "week" },
      { timeline: { start: LATER, end: { kind: "never" } } },
    );
    const { host, index } = await buildZoom({ journals: { daily, weekly: laterWeekly } });
    index.register({ journalName: "daily", anchor: anchor("2026-05-04"), path: DAY_NOTE });
    host.emitActiveLeafChange(host.putFile(DAY_NOTE));

    expect(host.commands.get("zoom-out")?.checkCallback?.(true)).toBe(false);
  });

  it("asks which journal to open when two share the target granularity", async () => {
    const work = fixedJournal("work-monthly", { type: "month" });
    const { host, index, suggests } = await buildZoom({ journals: { daily, monthly, "work-monthly": work } });
    index.register({ journalName: "daily", anchor: anchor("2026-05-04"), path: DAY_NOTE });
    host.emitActiveLeafChange(host.putFile(DAY_NOTE));

    host.commands.get("zoom-out")?.checkCallback?.(false);

    await vi.waitFor(() => expect(suggests.opens.length).toBe(1));
    expect(suggests.lastOpen<readonly string[], string>().input).toEqual(["monthly", "work-monthly"]);
  });

  it("keeps a shelved journal's zoom on its own shelf", async () => {
    const other = fixedJournal("private-monthly", { type: "month" });
    const { host, index, workspace } = await buildZoom({
      journals: { daily, monthly, "private-monthly": other },
      shelves: { work: buildShelf("work", { journals: ["daily", "monthly"] }) },
    });
    index.register({ journalName: "daily", anchor: anchor("2026-05-04"), path: DAY_NOTE });
    index.register({ journalName: "monthly", anchor: anchor("2026-05-01"), path: MONTH_NOTE });
    host.emitActiveLeafChange(host.putFile(DAY_NOTE));

    host.commands.get("zoom-out")?.checkCallback?.(false);

    await vi.waitFor(() => expect(workspace.isOpen(MONTH_NOTE)).toBe(true));
  });

  it("steps from the period a notelet is filed under", async () => {
    const { host, index, workspace } = await buildZoom({ journals: { daily, monthly } });
    const notelet = "standup.md" as VaultPath;
    index.register({
      kind: "notelet",
      journalName: "daily",
      anchor: anchor("2026-05-04"),
      path: notelet,
      typeName: "Standup",
      typeId: null,
    });
    index.register({ journalName: "monthly", anchor: anchor("2026-05-01"), path: MONTH_NOTE });
    host.emitActiveLeafChange(host.putFile(notelet));

    host.commands.get("zoom-out")?.checkCallback?.(false);

    await vi.waitFor(() => expect(workspace.isOpen(MONTH_NOTE)).toBe(true));
  });

  it("tells a bound hotkey why nothing opened when no journal is longer", async () => {
    const { host, index, notices } = await buildZoom({ journals: { daily } });
    index.register({ journalName: "daily", anchor: anchor("2026-05-04"), path: DAY_NOTE });
    host.emitActiveLeafChange(host.putFile(DAY_NOTE));

    host.commands.get("zoom-out")?.checkCallback?.(false);

    await vi.waitFor(() => expect(notices.messages).toContain(m.command_zoom_no_longer()));
  });

  it("tells a bound hotkey why nothing opened when no journal note is active", async () => {
    const { host, notices } = await buildZoom({ journals: { daily, monthly } });
    host.emitActiveLeafChange(host.putFile(ORPHAN));

    host.commands.get("zoom-in")?.checkCallback?.(false);

    await vi.waitFor(() => expect(notices.messages).toContain(m.command_open_needs_active_note()));
  });
});
