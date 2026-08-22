import { beforeEach, describe, expect, it } from "vitest";

import { anchor } from "@/calendar/testing";
import { Flows } from "@/infrastructure/flows";
import { WorkspaceService } from "@/infrastructure/host";
import type { VaultPath } from "@/infrastructure/host";
import { testContainer, type TestHarness } from "@/testing";

import { journalsCoreModule } from "../module";
import { fixedJournal } from "../testing";

import { EnsureJournalEntryFlow } from "./ensure-journal-entry.flow";

describe("EnsureJournalEntryFlow", () => {
  describe("creating a note", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      });
    });

    it("creates the note without opening it", async () => {
      const result = await harness.resolve(Flows).invoke(EnsureJournalEntryFlow, {
        journalName: "daily",
        anchor: anchor("2026-05-19"),
      });

      expect(result.isOk() && result.value).toEqual({ path: "2026-05-19.md", created: true });
      expect(harness.host.files.has("2026-05-19.md")).toBe(true);
      expect(harness.resolve(WorkspaceService).isOpen("2026-05-19.md" as VaultPath)).toBe(false);
    });

    it("reports created false for a note that already exists", async () => {
      harness.host.putFile("2026-05-19.md", "existing");

      const result = await harness.resolve(Flows).invoke(EnsureJournalEntryFlow, {
        journalName: "daily",
        anchor: anchor("2026-05-19"),
      });

      expect(result.isOk() && result.value.created).toBe(false);
    });
  });

  describe("the creation prompt", () => {
    let harness: TestHarness;

    beforeEach(async () => {
      harness = await testContainer({
        modules: [journalsCoreModule],
        data: { journals: { daily: fixedJournal("daily", { type: "day" }, { confirmCreation: true }) } },
      });
    });

    it("honors the journal's creation prompt by default", async () => {
      const pending = harness.resolve(Flows).invoke(EnsureJournalEntryFlow, {
        journalName: "daily",
        anchor: anchor("2026-05-19"),
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(harness.modals.opens).toHaveLength(1);

      harness.modals.lastOpen<unknown, boolean>().submit(true);
      const settled = await pending;
      expect(settled.isOk()).toBe(true);
    });

    it("skips the creation prompt when asked to", async () => {
      const result = await harness.resolve(Flows).invoke(EnsureJournalEntryFlow, {
        journalName: "daily",
        anchor: anchor("2026-05-19"),
        skipConfirmation: true,
      });

      expect(harness.modals.opens).toHaveLength(0);
      expect(result.isOk() && result.value.created).toBe(true);
    });
  });
});
