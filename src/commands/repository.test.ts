import { createNanoEvents, type Emitter } from "nanoevents";
import { describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

import { commandCollection, type CommandConfig } from "./config";
import { CommandIdTakenError, UnknownCommandError } from "./errors";
import { CommandsRepository, type CommandsEvents } from "./repository";

function buildRepo(initial: Record<string, CommandConfig> = {}) {
  const storage = reactive<Record<string, CommandConfig>>({ ...initial });
  const events: Emitter<CommandsEvents> = createNanoEvents();
  const repo = CommandsRepository.fromParts(storage, events);
  return { repo, storage, events };
}

const sampleCommand = (): CommandConfig => commandCollection.defaultItem("ignored");

describe("CommandsRepository", () => {
  describe("create", () => {
    it("inserts a command at the given id", () => {
      const { repo, storage } = buildRepo();
      const cmd = sampleCommand();
      repo.create("cmd-1", cmd);
      expect(storage["cmd-1"]).toEqual(cmd);
    });

    it("emits created with the id", () => {
      const { repo, events } = buildRepo();
      const spy = vi.fn();
      events.on("created", spy);
      repo.create("cmd-1", sampleCommand());
      expect(spy).toHaveBeenCalledWith("cmd-1");
    });

    it("rejects a duplicate id with CommandIdTakenError", () => {
      const { repo } = buildRepo({ "cmd-1": sampleCommand() });
      const result = repo.create("cmd-1", sampleCommand());
      expect(result.isErr() && result.error).toBeInstanceOf(CommandIdTakenError);
    });
  });

  describe("inherited update", () => {
    it("merges changes into the stored command", () => {
      const { repo, storage } = buildRepo({ "cmd-1": sampleCommand() });
      repo.update("cmd-1", { name: "Renamed" });
      expect(storage["cmd-1"]?.name).toBe("Renamed");
    });

    it("returns UnknownCommandError for an unknown id", () => {
      const { repo } = buildRepo();
      const result = repo.update("nope", { name: "X" });
      expect(result.isErr() && result.error).toBeInstanceOf(UnknownCommandError);
    });
  });

  describe("inherited delete", () => {
    it("removes the command from storage", () => {
      const { repo, storage } = buildRepo({ "cmd-1": sampleCommand() });
      repo.delete("cmd-1");
      expect(storage["cmd-1"]).toBeUndefined();
    });

    it("emits deleted with the id", () => {
      const { repo, events } = buildRepo({ "cmd-1": sampleCommand() });
      const spy = vi.fn();
      events.on("deleted", spy);
      repo.delete("cmd-1");
      expect(spy).toHaveBeenCalledWith("cmd-1");
    });

    it("returns UnknownCommandError for an unknown id", () => {
      const { repo } = buildRepo();
      const result = repo.delete("nope");
      expect(result.isErr() && result.error).toBeInstanceOf(UnknownCommandError);
    });
  });

  describe("find", () => {
    it("yields commands keyed by their record id", () => {
      const { repo } = buildRepo({ a: sampleCommand(), b: sampleCommand() });
      expect([...repo.find().ids()]).toEqual(["a", "b"]);
    });

    it("labels options by the name field", () => {
      const a = { ...sampleCommand(), name: "Alpha" };
      const b = { ...sampleCommand(), name: "Beta" };
      const { repo } = buildRepo({ a, b });
      expect([...repo.find().options()]).toEqual([
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
      ]);
    });
  });
});
