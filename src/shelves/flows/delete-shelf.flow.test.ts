import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { createSettingsService } from "@/settings/testing";

import { shelvesCollection } from "../config";
import { ShelvesRepository } from "../repository";
import { ShelvesEventsToken } from "../tokens";

import { DeleteShelfFlow } from "./delete-shelf.flow";

async function build(raw?: unknown) {
  const { service: settings, container } = createSettingsService({
    collections: [shelvesCollection],
    raw,
  });
  await settings.initialize();
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(ShelvesEventsToken).useFactory(() => createNanoEvents());
  container.register(ShelvesRepository).useClass(ShelvesRepository);
  container.register(Flows).useClass(Flows);
  container.register(DeleteShelfFlow).useClass(DeleteShelfFlow);
  const repo = container.resolve(ShelvesRepository);
  return { repo, modals, flows: container.resolve(Flows) };
}

describe("DeleteShelfFlow", () => {
  it("removes the shelf and moves its journals to the chosen destination", async () => {
    const raw = {
      version: 4,
      shelves: {
        Work: { name: "Work", journals: ["daily"] },
        Personal: { name: "Personal", journals: [] },
      },
    };
    const { flows, modals, repo } = await build(raw);
    const promise = flows.invoke(DeleteShelfFlow, { shelfName: "Work" });
    modals.lastOpen<unknown, string>().submit("Personal");
    await promise;
    expect(repo.get("Work").isNone()).toBe(true);
    expect(repo.get("Personal").getOr(undefined as never)?.journals).toEqual(["daily"]);
  });

  it("leaves the shelf in place when the modal is cancelled", async () => {
    const raw = { version: 4, shelves: { Work: { name: "Work", journals: [] } } };
    const { flows, modals, repo } = await build(raw);
    const promise = flows.invoke(DeleteShelfFlow, { shelfName: "Work" });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(repo.get("Work").isSome()).toBe(true);
  });
});
