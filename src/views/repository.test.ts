import { describe, expect, it } from "vitest";

import { journalsCoreModule } from "@/journals/module";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer, type TestHarness } from "@/testing";

import { viewsCoreModule } from "./module";
import { ViewsRepository } from "./repository";
import { buildView } from "./testing";

import type { View, ViewId } from "./config";

const ID_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

async function buildRepo(views: Record<string, View> = {}): Promise<TestHarness> {
  return testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, viewsCoreModule],
    data: { views },
  });
}

describe("ViewsRepository", () => {
  describe("get", () => {
    it("returns None for an unknown view id", async () => {
      const harness = await buildRepo();
      const repo = harness.resolve(ViewsRepository);
      expect(repo.get("missing" as ViewId).isNone()).toBe(true);
    });

    it("returns the stored view for a known id", async () => {
      const stored = buildView(ID_A);
      const harness = await buildRepo({ [ID_A]: stored });
      const repo = harness.resolve(ViewsRepository);
      expect(repo.get(ID_A as ViewId).match({ some: (v) => v, none: () => null })).toEqual(stored);
    });
  });

  describe("find", () => {
    it("iterates all stored views", async () => {
      const harness = await buildRepo({ [ID_A]: buildView(ID_A), [ID_B]: buildView(ID_B) });
      const repo = harness.resolve(ViewsRepository);
      const ids = [...repo.find().entries()].map(([id]) => id);
      expect(ids).toEqual([ID_A, ID_B]);
    });
  });
});
