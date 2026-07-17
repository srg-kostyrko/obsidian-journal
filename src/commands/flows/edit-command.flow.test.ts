import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { NoticeService } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import { createSettingsService } from "@/settings/testing";

import { commandCollection, type CommandConfig } from "../config";
import { CommandsRepository } from "../repository";
import { CommandsEventsToken } from "../tokens";

import { EditCommandFlow } from "./edit-command.flow";

function makeConfig(name: string, target?: CommandConfig["target"]): CommandConfig {
  return {
    name,
    icon: "",
    showInRibbon: false,
    openMode: "active",
    target: target ?? { kind: "all", writeType: "day" },
    type: "same",
    context: "today",
  };
}

async function build(raw?: unknown) {
  const { service: settings, container } = createSettingsService({
    collections: [commandCollection],
    raw,
  });
  await settings.initialize();
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(CommandsEventsToken).useFactory(() => createNanoEvents());
  container.register(CommandsRepository).useClass(CommandsRepository);
  container.register(NoticeService).useValue(new FakeNoticeService());
  container.register(Flows).useClass(Flows);
  container.register(EditCommandFlow).useClass(EditCommandFlow);
  const repo = container.resolve(CommandsRepository);
  return { repo, modals, flows: container.resolve(Flows) };
}

describe("EditCommandFlow", () => {
  it("adds a new command to the collection on submit", async () => {
    const { flows, modals, repo } = await build({ version: 4, commands: {} });
    const promise = flows.invoke(EditCommandFlow, { target: { kind: "all", writeType: "day" } });
    modals.lastOpen<unknown, CommandConfig>().submit(makeConfig("Added"));
    await promise;
    expect([...repo.find().list()]).toEqual([makeConfig("Added")]);
  });

  it("overwrites the existing entry when editing", async () => {
    const raw = { version: 4, commands: { "cmd-1": makeConfig("Old") } };
    const { flows, modals, repo } = await build(raw);
    const promise = flows.invoke(EditCommandFlow, {
      commandId: "cmd-1",
      target: { kind: "all", writeType: "day" },
    });
    modals.lastOpen<unknown, CommandConfig>().submit(makeConfig("New"));
    await promise;
    expect(repo.get("cmd-1").getOr(undefined as never)?.name).toBe("New");
  });

  describe("takenNames scope", () => {
    // Commands live in one flat collection, but v2 namespaced names per owner — two
    // journals may each hold an "Open today's note"; only same-owner names collide.
    const raw = {
      version: 4,
      commands: {
        a: makeConfig("Daily open", { kind: "journal", journalName: "daily" }),
        b: makeConfig("Work open", { kind: "journal", journalName: "work" }),
        c: makeConfig("Shelf open", { kind: "shelf", shelfName: "desk", writeType: "day" }),
        d: makeConfig("Global open", { kind: "all", writeType: "week" }),
      },
    };

    it("marks only same-journal command names as taken", async () => {
      const { flows, modals } = await build(raw);
      const promise = flows.invoke(EditCommandFlow, { target: { kind: "journal", journalName: "daily" } });
      expect((modals.lastOpen().props as { takenNames: string[] }).takenNames).toEqual(["Daily open"]);
      modals.lastOpen().cancel();
      await promise;
    });

    it("marks only same-shelf command names as taken", async () => {
      const { flows, modals } = await build(raw);
      const promise = flows.invoke(EditCommandFlow, {
        target: { kind: "shelf", shelfName: "desk", writeType: "week" },
      });
      expect((modals.lastOpen().props as { takenNames: string[] }).takenNames).toEqual(["Shelf open"]);
      modals.lastOpen().cancel();
      await promise;
    });

    it("marks plugin-level command names as taken regardless of write type", async () => {
      const { flows, modals } = await build(raw);
      const promise = flows.invoke(EditCommandFlow, { target: { kind: "all", writeType: "day" } });
      expect((modals.lastOpen().props as { takenNames: string[] }).takenNames).toEqual(["Global open"]);
      modals.lastOpen().cancel();
      await promise;
    });
  });

  it("leaves the collection untouched when the modal is cancelled", async () => {
    const { flows, modals, repo } = await build({ version: 4, commands: {} });
    const promise = flows.invoke(EditCommandFlow, { target: { kind: "all", writeType: "day" } });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(result.kind === "err" && (result.error as UserAborted).source).toBe("edit-command-modal");
    expect(repo.count()).toBe(0);
  });
});
