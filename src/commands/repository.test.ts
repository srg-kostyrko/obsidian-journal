import { describe, expect, it, vi } from "vitest";

import { testContainer } from "@/testing";

import { commandCollection, type CommandConfig } from "./config";
import { CommandIdTakenError, UnknownCommandError } from "./errors";
import { commandsCoreModule } from "./module";
import { CommandsRepository } from "./repository";
import { buildCommand } from "./testing";
import { CommandsEventsToken } from "./tokens";

async function buildRepo(initial: Record<string, CommandConfig> = {}) {
  const harness = await testContainer({
    modules: [commandsCoreModule],
    data: { commands: initial },
  });
  return {
    repo: harness.resolve(CommandsRepository),
    storage: harness.settings.recordOf(commandCollection),
    events: harness.resolve(CommandsEventsToken),
  };
}

describe("CommandsRepository", () => {
  describe("create", () => {
    it("inserts a command at the given id", async () => {
      const { repo, storage } = await buildRepo();
      const command = buildCommand();
      repo.create("cmd-1", command);
      expect(storage["cmd-1"]).toEqual(command);
    });

    it("emits created with the id", async () => {
      const { repo, events } = await buildRepo();
      const spy = vi.fn();
      events.on("created", spy);
      repo.create("cmd-1", buildCommand());
      expect(spy).toHaveBeenCalledWith("cmd-1");
    });

    it("rejects a duplicate id with CommandIdTakenError", async () => {
      const { repo } = await buildRepo({ "cmd-1": buildCommand() });
      const result = repo.create("cmd-1", buildCommand());
      expect(result.isErr() && result.error).toBeInstanceOf(CommandIdTakenError);
    });
  });

  describe("inherited update", () => {
    it("merges changes into the stored command", async () => {
      const { repo, storage } = await buildRepo({ "cmd-1": buildCommand() });
      repo.update("cmd-1", { name: "Renamed" });
      expect(storage["cmd-1"]?.name).toBe("Renamed");
    });

    it("returns UnknownCommandError for an unknown id", async () => {
      const { repo } = await buildRepo();
      const result = repo.update("nope", { name: "X" });
      expect(result.isErr() && result.error).toBeInstanceOf(UnknownCommandError);
    });
  });

  describe("inherited delete", () => {
    it("removes the command from storage", async () => {
      const { repo, storage } = await buildRepo({ "cmd-1": buildCommand() });
      repo.delete("cmd-1");
      expect(storage["cmd-1"]).toBeUndefined();
    });

    it("emits deleted with the id", async () => {
      const { repo, events } = await buildRepo({ "cmd-1": buildCommand() });
      const spy = vi.fn();
      events.on("deleted", spy);
      repo.delete("cmd-1");
      expect(spy).toHaveBeenCalledWith("cmd-1");
    });

    it("returns UnknownCommandError for an unknown id", async () => {
      const { repo } = await buildRepo();
      const result = repo.delete("nope");
      expect(result.isErr() && result.error).toBeInstanceOf(UnknownCommandError);
    });
  });

  describe("find", () => {
    it("yields commands keyed by their record id", async () => {
      const { repo } = await buildRepo({ a: buildCommand(), b: buildCommand() });
      expect([...repo.find().ids()]).toEqual(["a", "b"]);
    });

    it("labels options by the name field", async () => {
      const { repo } = await buildRepo({ a: buildCommand({ name: "Alpha" }), b: buildCommand({ name: "Beta" }) });
      expect([...repo.find().options()]).toEqual([
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
      ]);
    });
  });
});
