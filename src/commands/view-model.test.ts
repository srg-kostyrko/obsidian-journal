import { describe, expect, it } from "vitest";

import { testContainer } from "@/testing";

import { commandsCoreModule } from "./module";
import { buildCommand } from "./testing";
import { CommandsViewModel } from "./view-model";

import type { CommandConfig } from "./config";

async function resolveViewModel(initial: Record<string, CommandConfig> = {}): Promise<CommandsViewModel> {
  const harness = await testContainer({
    modules: [commandsCoreModule],
    data: { commands: initial },
  });
  return harness.resolve(CommandsViewModel);
}

describe("CommandsViewModel", () => {
  describe("commands", () => {
    it("yields the current commands", async () => {
      const command = buildCommand();
      const viewModel = await resolveViewModel({ a: command });
      expect(viewModel.commands.value).toEqual([command]);
    });
  });

  describe("commandCount", () => {
    it("returns the count", async () => {
      const viewModel = await resolveViewModel({ a: buildCommand() });
      expect(viewModel.commandCount.value).toBe(1);
    });
  });

  describe("getCommand", () => {
    it("returns Some for a known id", async () => {
      const viewModel = await resolveViewModel({ a: buildCommand() });
      expect(viewModel.getCommand("a").isSome()).toBe(true);
    });

    it("returns None for an unknown id", async () => {
      const viewModel = await resolveViewModel();
      expect(viewModel.getCommand("nope").isNone()).toBe(true);
    });
  });

  describe("commandIds", () => {
    it("yields the ids of all current commands", async () => {
      const viewModel = await resolveViewModel({ a: buildCommand(), b: buildCommand() });
      expect(viewModel.commandIds.value).toEqual(["a", "b"]);
    });
  });
});
