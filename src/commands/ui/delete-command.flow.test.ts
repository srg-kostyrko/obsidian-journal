import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { createSettingsService } from "@/settings/testing";

import { commandCollection, type CommandConfig } from "../config";

import { DeleteCommandFlow } from "./delete-command.flow";

function makeConfig(name: string): CommandConfig {
  return {
    name,
    icon: "",
    showInRibbon: false,
    openMode: "active",
    target: { kind: "all", writeType: "day" },
    type: "same",
    context: "today",
  };
}

async function build() {
  const raw = { version: 3, commands: { "cmd-1": makeConfig("Doomed") } };
  const { service: settings, container } = createSettingsService({
    collections: [commandCollection],
    raw,
  });
  await settings.initialize();
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(Flows).useClass(Flows);
  container.register(DeleteCommandFlow).useClass(DeleteCommandFlow);
  return { settings, modals, flows: container.resolve(Flows) };
}

describe("DeleteCommandFlow", () => {
  it("removes the command from the collection on confirm", async () => {
    const { flows, modals, settings } = await build();
    const promise = flows.invoke(DeleteCommandFlow, { commandId: "cmd-1" });
    modals.lastOpen<{ commandName: string }, void>().submit();
    await promise;
    expect(settings.getCollection(commandCollection).get("cmd-1")).toBeUndefined();
  });

  it("leaves the command in place when cancelled", async () => {
    const { flows, modals, settings } = await build();
    const promise = flows.invoke(DeleteCommandFlow, { commandId: "cmd-1" });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(result.kind === "err" && (result.error as UserAborted).source).toBe("delete-command-modal");
    expect(settings.getCollection(commandCollection).get("cmd-1")).toBeDefined();
  });
});
