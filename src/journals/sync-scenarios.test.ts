import { afterEach, assert, beforeEach, describe, expect, it } from "vitest";

import type { AnchorString } from "@/calendar";
import { installTestCalendar } from "@/calendar/testing";
import type { VaultPath } from "@/infrastructure/host";

import { JournalsIndex } from "./journals-index";
import { fixedJournal } from "./testing";
import { VaultSubscriptionService } from "./vault-subscription";
import { buildRig } from "./vault-subscription.testing";

const ANCHOR = "2024-01-01" as AnchorString;
const ORIGINAL = "daily/2024-01-01.md" as VaultPath;
const CONFLICT = "daily/2024-01-01 (conflicted copy 2026-07-16).md" as VaultPath;
const FM = { journal: "daily", "journal-date": "2024-01-01" };

async function startedRig(initialPaths: VaultPath[] = []) {
  const rig = buildRig({ daily: fixedJournal("daily", { type: "day" }) }, initialPaths);
  await rig.container.resolve(VaultSubscriptionService).initialize();
  return { rig, index: rig.container.resolve(JournalsIndex) };
}

describe("sync scenarios", () => {
  let teardown: () => void;
  beforeEach(() => {
    ({ teardown } = installTestCalendar());
  });
  afterEach(() => {
    teardown();
  });

  describe("conflict copy sharing an anchor", () => {
    it("keeps the original note in the anchor slot when a conflict copy arrives", async () => {
      const { rig, index } = await startedRig();
      rig.setFrontmatter(ORIGINAL, FM);
      rig.emit("metadata-changed", ORIGINAL);
      rig.setFrontmatter(CONFLICT, FM);
      rig.emit("metadata-changed", CONFLICT);

      const atAnchor = index.entryByAnchor("daily", ANCHOR);
      assert(atAnchor.isSome());
      expect(atAnchor.value.path).toBe(ORIGINAL);
    });

    it("keeps the conflict copy resolvable by its own path", async () => {
      const { rig, index } = await startedRig();
      rig.setFrontmatter(ORIGINAL, FM);
      rig.emit("metadata-changed", ORIGINAL);
      rig.setFrontmatter(CONFLICT, FM);
      rig.emit("metadata-changed", CONFLICT);

      expect(index.entryByPath(CONFLICT).isSome()).toBe(true);
    });

    it("keeps the original reachable after the conflict copy is deleted", async () => {
      const { rig, index } = await startedRig();
      rig.setFrontmatter(ORIGINAL, FM);
      rig.emit("metadata-changed", ORIGINAL);
      rig.setFrontmatter(CONFLICT, FM);
      rig.emit("metadata-changed", CONFLICT);

      rig.emit("deleted", CONFLICT);

      const atAnchor = index.entryByAnchor("daily", ANCHOR);
      assert(atAnchor.isSome());
      expect(atAnchor.value.path).toBe(ORIGINAL);
    });
  });

  describe("note referencing an unknown journal", () => {
    it("does not index a note whose journal config is absent locally", async () => {
      const { rig, index } = await startedRig();
      rig.setFrontmatter("inbox/x.md", { journal: "not-synced-yet", "journal-date": "2024-01-01" });
      rig.emit("metadata-changed", "inbox/x.md" as VaultPath);

      expect(index.entryByPath("inbox/x.md" as VaultPath).isNone()).toBe(true);
    });
  });

  describe("burst of synced notes", () => {
    it("indexes every note when a batch of metadata-changed events arrives at once", async () => {
      const { rig, index } = await startedRig();
      const paths: VaultPath[] = [];
      // 28 valid February days — a batch large enough to exercise the coalesced dirty flush.
      for (let day = 1; day <= 28; day++) {
        const date = `2024-02-${String(day).padStart(2, "0")}`;
        const path = `daily/${date}.md` as VaultPath;
        paths.push(path);
        rig.setFrontmatter(path, { journal: "daily", "journal-date": date });
      }
      for (const path of paths) rig.emit("metadata-changed", path);

      expect([...index.entriesFor("daily")]).toHaveLength(28);
    });
  });
});
