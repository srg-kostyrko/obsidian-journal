import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";
import { reactive } from "vue";

import { commandCollection, type CommandConfig } from "./config";
import { CommandsRepository, type CommandsEvents } from "./repository";
import { CommandsViewModel } from "./view-model";

function buildVM(initial: Record<string, CommandConfig> = {}) {
  const storage = reactive<Record<string, CommandConfig>>({ ...initial });
  const events = createNanoEvents<CommandsEvents>();
  const repo = CommandsRepository.fromParts(storage, events);
  const vm = CommandsViewModel.fromRepository(repo);
  return { vm, repo };
}

describe("CommandsViewModel", () => {
  describe("commands", () => {
    it("yields the current commands", () => {
      const cmd = commandCollection.defaultItem("ignored");
      const { vm } = buildVM({ a: cmd });
      expect(vm.commands.value).toEqual([cmd]);
    });
  });

  describe("commandCount", () => {
    it("returns the count", () => {
      const { vm } = buildVM({ a: commandCollection.defaultItem("ignored") });
      expect(vm.commandCount.value).toBe(1);
    });
  });

  describe("getCommand", () => {
    it("returns Some for a known id", () => {
      const { vm } = buildVM({ a: commandCollection.defaultItem("ignored") });
      expect(vm.getCommand("a").isSome()).toBe(true);
    });

    it("returns None for an unknown id", () => {
      const { vm } = buildVM();
      expect(vm.getCommand("nope").isNone()).toBe(true);
    });
  });

  describe("commandIds", () => {
    it("yields the ids of all current commands", () => {
      const { vm } = buildVM({
        a: commandCollection.defaultItem("ignored"),
        b: commandCollection.defaultItem("ignored"),
      });
      expect(vm.commandIds.value).toEqual(["a", "b"]);
    });
  });
});
