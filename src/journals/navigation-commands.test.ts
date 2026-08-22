import { TFile } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { anchor } from "@/calendar/testing";
import { m } from "@/i18n";
import { WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { testContainer, type TestHarness } from "@/testing";

import { JournalsIndex } from "./journals-index";
import { journalsModule } from "./module";
import { fixedJournal } from "./testing";

const FIRST = "daily/2026-05-01.md" as VaultPath;
const SECOND = "daily/2026-05-02.md" as VaultPath;
const ORPHAN = "notes/orphan.md" as VaultPath;

describe("JournalNavigationCommands", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      allow: { hostState: true },
    });
    harness.host.putFile(FIRST);
    harness.host.putFile(SECOND);
    harness.host.putFile(ORPHAN);
    const index = harness.resolve(JournalsIndex);
    index.register({ journalName: "daily", anchor: anchor("2026-05-01"), path: FIRST });
    index.register({ journalName: "daily", anchor: anchor("2026-05-02"), path: SECOND });
  });

  function setActive(path: VaultPath | null): void {
    const file = path ? harness.host.app.vault.getAbstractFileByPath(path) : null;
    harness.host.emitActiveLeafChange(file instanceof TFile ? file : null);
  }

  it("makes open-next available when the active note is connected to a journal", () => {
    setActive(FIRST);
    expect(harness.host.commands.get("open-next")?.checkCallback?.(true)).toBe(true);
  });

  it("keeps open-next available even when the active note has no following entry", () => {
    setActive(SECOND);
    expect(harness.host.commands.get("open-next")?.checkCallback?.(true)).toBe(true);
  });

  it("makes open-next unavailable when the active note is not a journal note", () => {
    setActive(ORPHAN);
    expect(harness.host.commands.get("open-next")?.checkCallback?.(true)).toBe(false);
  });

  it("makes open-next unavailable when no note is active", () => {
    setActive(null);
    expect(harness.host.commands.get("open-next")?.checkCallback?.(true)).toBe(false);
  });

  it("opens the following entry when open-next runs", () => {
    setActive(FIRST);
    harness.host.commands.get("open-next")?.checkCallback?.(false);
    expect(harness.resolve(WorkspaceService).isOpen(SECOND)).toBe(true);
  });

  it("opens the preceding entry when open-prev runs", () => {
    setActive(SECOND);
    harness.host.commands.get("open-prev")?.checkCallback?.(false);
    expect(harness.resolve(WorkspaceService).isOpen(FIRST)).toBe(true);
  });

  it("notifies when the following entry cannot be opened", async () => {
    // SECOND stays indexed but its file is removed from the vault, so the real
    // WorkspaceService's open fails on its own — no spy needed to force the error path.
    const secondFile = harness.host.app.vault.getAbstractFileByPath(SECOND);
    if (secondFile instanceof TFile) await harness.host.app.fileManager.trashFile(secondFile);
    setActive(FIRST);

    harness.host.commands.get("open-next")?.checkCallback?.(false);

    await vi.waitFor(() => expect(harness.notices.messages).toContain(m.common_note_open_error()));
  });

  it("notifies when open-next runs on a note with no following entry", () => {
    setActive(SECOND);
    harness.host.commands.get("open-next")?.checkCallback?.(false);
    expect(harness.notices.messages).toContain(m.command_open_no_next());
  });

  it("notifies when open-prev runs on a note with no preceding entry", () => {
    setActive(FIRST);
    harness.host.commands.get("open-prev")?.checkCallback?.(false);
    expect(harness.notices.messages).toContain(m.command_open_no_previous());
  });

  it("notifies when open-next runs on a note that belongs to no journal", () => {
    setActive(ORPHAN);
    harness.host.commands.get("open-next")?.checkCallback?.(false);
    expect(harness.notices.messages).toContain(m.command_open_needs_active_note());
  });
});
