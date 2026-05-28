import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";
import { reactive } from "vue";

import { ViewsRepository } from "./repository";
import { ViewsViewModel } from "./view-model";

import type { View, ViewId } from "./config";
import type { ViewsEvents } from "./tokens";

function makeView(id: string, name: string): View {
  return {
    id: id as ViewId,
    name,
    icon: "calendar-days",
    defaultShelf: null,
    showInRibbon: false,
    blocks: [],
  };
}

function buildVM(initial: View[] = []) {
  const storage = reactive<Record<string, View>>({});
  for (const v of initial) storage[v.id] = v;
  const events = createNanoEvents<ViewsEvents>();
  const repo = ViewsRepository.fromParts(storage, events);
  const vm = ViewsViewModel.fromRepository(repo);
  return { vm, repo };
}

describe("ViewsViewModel", () => {
  describe("views", () => {
    it("sorts entries by name", () => {
      const { vm } = buildVM([makeView("b", "Beta"), makeView("a", "Alpha")]);
      expect(vm.views.value.map((v) => v.name)).toEqual(["Alpha", "Beta"]);
    });

    it("reflects mutations after create", () => {
      const { vm, repo } = buildVM();
      repo.create(makeView("a", "Alpha"));
      expect(vm.views.value.map((v) => v.name)).toEqual(["Alpha"]);
    });
  });

  describe("viewCount", () => {
    it("returns the count", () => {
      const { vm } = buildVM([makeView("a", "Alpha")]);
      expect(vm.viewCount.value).toBe(1);
    });
  });

  describe("getView", () => {
    it("returns Some for a known id", () => {
      const { vm } = buildVM([makeView("a", "Alpha")]);
      expect(vm.getView("a" as ViewId).isSome()).toBe(true);
    });

    it("returns None for an unknown id", () => {
      const { vm } = buildVM();
      expect(vm.getView("missing" as ViewId).isNone()).toBe(true);
    });
  });
});
