import { assert, beforeEach, describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import type { VaultPath } from "@/infrastructure/host";
import { testContainer, type TestHarness } from "@/testing";

import { JournalsIndex } from "./journals-index";
import { journalsCoreModule } from "./module";
import { fixedJournal } from "./testing";
import { VaultSubscriptionService } from "./vault-subscription";

const ANCHOR = "2024-01-01" as AnchorString;
const ORIGINAL = "daily/2024-01-01.md" as VaultPath;
const CONFLICT = "daily/2024-01-01 (conflicted copy 2026-07-16).md" as VaultPath;
const FM = { journal: "daily", "journal-date": "2024-01-01" };

describe("sync scenarios", () => {
  let harness: TestHarness;
  let index: JournalsIndex;

  beforeEach(async () => {
    harness = await testContainer({
      modules: [journalsCoreModule],
      data: { journals: { daily: fixedJournal("daily", { type: "day" }) } },
      initialize: [VaultSubscriptionService],
    });
    index = harness.resolve(JournalsIndex);
  });

  describe("conflict copy sharing an anchor", () => {
    it("keeps the original note in the anchor slot when a conflict copy arrives", () => {
      harness.host.putFile(ORIGINAL, "", FM);
      harness.host.emitMetadata(ORIGINAL);
      harness.host.putFile(CONFLICT, "", FM);
      harness.host.emitMetadata(CONFLICT);

      const atAnchor = index.entryByAnchor("daily", ANCHOR);
      assert(atAnchor.isSome());
      expect(atAnchor.value.path).toBe(ORIGINAL);
    });

    it("keeps the conflict copy resolvable by its own path", () => {
      harness.host.putFile(ORIGINAL, "", FM);
      harness.host.emitMetadata(ORIGINAL);
      harness.host.putFile(CONFLICT, "", FM);
      harness.host.emitMetadata(CONFLICT);

      expect(index.entryByPath(CONFLICT).isSome()).toBe(true);
    });

    it("keeps the original reachable after the conflict copy is deleted", async () => {
      harness.host.putFile(ORIGINAL, "", FM);
      harness.host.emitMetadata(ORIGINAL);
      const conflictFile = harness.host.putFile(CONFLICT, "", FM);
      harness.host.emitMetadata(CONFLICT);

      await harness.host.app.fileManager.trashFile(conflictFile);

      const atAnchor = index.entryByAnchor("daily", ANCHOR);
      assert(atAnchor.isSome());
      expect(atAnchor.value.path).toBe(ORIGINAL);
    });
  });

  describe("note referencing an unknown journal", () => {
    it("does not index a note whose journal config is absent locally", () => {
      harness.host.putFile("inbox/x.md", "", { journal: "not-synced-yet", "journal-date": "2024-01-01" });
      harness.host.emitMetadata("inbox/x.md");

      expect(index.entryByPath("inbox/x.md" as VaultPath).isNone()).toBe(true);
    });
  });

  describe("burst of synced notes", () => {
    it("indexes every note when a batch of metadata-changed events arrives at once", () => {
      const paths: VaultPath[] = [];
      // 28 valid February days — a batch large enough to exercise the coalesced dirty flush.
      for (let day = 1; day <= 28; day++) {
        const date = `2024-02-${String(day).padStart(2, "0")}`;
        const path = `daily/${date}.md` as VaultPath;
        paths.push(path);
        harness.host.putFile(path, "", { journal: "daily", "journal-date": date });
      }
      for (const path of paths) harness.host.emitMetadata(path);

      expect([...index.entriesFor("daily")]).toHaveLength(28);
    });
  });
});
