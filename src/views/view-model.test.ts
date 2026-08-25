import { describe, expect, it } from "vitest";

import { journalsCoreModule } from "@/journals/module";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer, type TestHarness } from "@/testing";

import { viewsCoreModule } from "./module";
import { ViewsRepository } from "./repository";
import { buildView } from "./testing";
import { ViewsViewModel } from "./view-model";

import type { View, ViewId } from "./config";

const ID_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

async function buildHarness(views: Record<string, View> = {}): Promise<TestHarness> {
  return testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, viewsCoreModule],
    data: { views },
  });
}

async function resolveViewModel(views: Record<string, View> = {}): Promise<ViewsViewModel> {
  const harness = await buildHarness(views);
  return harness.resolve(ViewsViewModel);
}

describe("ViewsViewModel", () => {
  describe("views", () => {
    it("sorts entries by name", async () => {
      const vm = await resolveViewModel({
        [ID_B]: buildView(ID_B, { name: "Beta" }),
        [ID_A]: buildView(ID_A, { name: "Alpha" }),
      });
      expect(vm.views.value.map((v) => v.name)).toEqual(["Alpha", "Beta"]);
    });

    it("reflects mutations after create", async () => {
      const harness = await buildHarness();
      const vm = harness.resolve(ViewsViewModel);
      const repo = harness.resolve(ViewsRepository);

      repo.create(buildView(ID_A, { name: "Alpha" }));

      expect(vm.views.value.map((v) => v.name)).toEqual(["Alpha"]);
    });
  });

  describe("viewCount", () => {
    it("returns the count", async () => {
      const vm = await resolveViewModel({ [ID_A]: buildView(ID_A, { name: "Alpha" }) });
      expect(vm.viewCount.value).toBe(1);
    });
  });

  describe("getView", () => {
    it("returns Some for a known id", async () => {
      const vm = await resolveViewModel({ [ID_A]: buildView(ID_A, { name: "Alpha" }) });
      expect(vm.getView(ID_A as ViewId).isSome()).toBe(true);
    });

    it("returns None for an unknown id", async () => {
      const vm = await resolveViewModel();
      expect(vm.getView("missing" as ViewId).isNone()).toBe(true);
    });
  });
});
