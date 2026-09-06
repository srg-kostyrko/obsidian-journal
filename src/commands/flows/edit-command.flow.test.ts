import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { testContainer } from "@/testing";

import { commandsCoreModule } from "../module";
import { CommandsRepository } from "../repository";
import { buildCommand } from "../testing";

import { EditCommandFlow } from "./edit-command.flow";

import type { CommandConfig } from "../config";

async function build(commands: Record<string, CommandConfig> = {}) {
  const harness = await testContainer({
    modules: [commandsCoreModule],
    data: { commands },
  });
  return {
    repo: harness.resolve(CommandsRepository),
    modals: harness.modals,
    flows: harness.resolve(Flows),
  };
}

describe("EditCommandFlow", () => {
  it("adds a new command to the collection on submit", async () => {
    const { flows, modals, repo } = await build();
    const promise = flows.invoke(EditCommandFlow, { target: { kind: "all", writeType: "day" } });
    modals.lastOpen<unknown, CommandConfig>().submit(buildCommand({ name: "Added" }));
    await promise;
    expect([...repo.find().list()]).toEqual([buildCommand({ name: "Added" })]);
  });

  it("overwrites the existing entry when editing", async () => {
    const { flows, modals, repo } = await build({ "cmd-1": buildCommand({ name: "Old" }) });
    const promise = flows.invoke(EditCommandFlow, {
      commandId: "cmd-1",
      target: { kind: "all", writeType: "day" },
    });
    modals.lastOpen<unknown, CommandConfig>().submit(buildCommand({ name: "New" }));
    await promise;
    expect(repo.get("cmd-1").getOr(undefined as never)?.name).toBe("New");
  });

  describe("takenNames scope", () => {
    // Commands live in one flat collection, but names collide only within the same owner —
    // two journals may each hold an "Open today's note" without conflict.
    const owners: Record<string, CommandConfig> = {
      a: buildCommand({ name: "Daily open", target: { kind: "journal", journalName: "daily" } }),
      b: buildCommand({ name: "Work open", target: { kind: "journal", journalName: "work" } }),
      c: buildCommand({ name: "Shelf open", target: { kind: "shelf", shelfName: "desk", writeType: "day" } }),
      d: buildCommand({ name: "Global open", target: { kind: "all", writeType: "week" } }),
    };

    it("marks only same-journal command names as taken", async () => {
      const { flows, modals } = await build(owners);
      const promise = flows.invoke(EditCommandFlow, { target: { kind: "journal", journalName: "daily" } });
      expect((modals.lastOpen().props as { takenNames: string[] }).takenNames).toEqual(["Daily open"]);
      modals.lastOpen().cancel();
      await promise;
    });

    it("marks only same-shelf command names as taken", async () => {
      const { flows, modals } = await build(owners);
      const promise = flows.invoke(EditCommandFlow, {
        target: { kind: "shelf", shelfName: "desk", writeType: "week" },
      });
      expect((modals.lastOpen().props as { takenNames: string[] }).takenNames).toEqual(["Shelf open"]);
      modals.lastOpen().cancel();
      await promise;
    });

    // A journal and its notelet types share the palette's journal-name prefix, so a name held
    // by either would render identically under the other.
    it("marks a notelet type's command names as taken for the journal's own command", async () => {
      const { flows, modals } = await build({
        n: buildCommand({ name: "New standup", target: { kind: "notelet", journalName: "daily", typeId: "nt_1" } }),
        ...owners,
      });
      const promise = flows.invoke(EditCommandFlow, { target: { kind: "journal", journalName: "daily" } });
      expect((modals.lastOpen().props as { takenNames: string[] }).takenNames).toEqual(["New standup", "Daily open"]);
      modals.lastOpen().cancel();
      await promise;
    });

    it("marks the journal's own command names as taken for one of its notelet types", async () => {
      const { flows, modals } = await build(owners);
      const promise = flows.invoke(EditCommandFlow, {
        target: { kind: "notelet", journalName: "daily", typeId: "nt_1" },
      });
      expect((modals.lastOpen().props as { takenNames: string[] }).takenNames).toEqual(["Daily open"]);
      modals.lastOpen().cancel();
      await promise;
    });

    it("marks plugin-level command names as taken regardless of write type", async () => {
      const { flows, modals } = await build(owners);
      const promise = flows.invoke(EditCommandFlow, { target: { kind: "all", writeType: "day" } });
      expect((modals.lastOpen().props as { takenNames: string[] }).takenNames).toEqual(["Global open"]);
      modals.lastOpen().cancel();
      await promise;
    });
  });

  it("leaves the collection untouched when the modal is cancelled", async () => {
    const { flows, modals, repo } = await build();
    const promise = flows.invoke(EditCommandFlow, { target: { kind: "all", writeType: "day" } });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(result.kind === "err" && (result.error as UserAborted).source).toBe("edit-command-modal");
    expect(repo.count()).toBe(0);
  });
});
