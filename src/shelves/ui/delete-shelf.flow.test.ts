import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { JournalLifecycleService } from "@/journals/settings/lifecycle";
import { createSettingsService } from "@/settings/testing";

import { shelvesCollection } from "../config";
import { ShelvesLifecycleService } from "../lifecycle";

import { DeleteShelfFlow } from "./delete-shelf.flow";

async function build(raw?: unknown) {
  const { service: settings, container } = createSettingsService({
    collections: [journalConfigCollection, shelvesCollection],
    raw,
  });
  await settings.initialize();
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(JournalLifecycleService).useClass(JournalLifecycleService);
  container.register(ShelvesLifecycleService).useClass(ShelvesLifecycleService);
  container.register(Flows).useClass(Flows);
  container.register(DeleteShelfFlow).useClass(DeleteShelfFlow);
  return { settings, modals, flows: container.resolve(Flows) };
}

describe("DeleteShelfFlow", () => {
  it("removes the shelf and moves its journals to the chosen destination", async () => {
    const raw = {
      version: 3,
      shelves: {
        Work: { name: "Work", journals: ["daily"] },
        Personal: { name: "Personal", journals: [] },
      },
    };
    const { flows, modals, settings } = await build(raw);
    const promise = flows.invoke(DeleteShelfFlow, { shelfName: "Work" });
    modals.lastOpen<unknown, string>().submit("Personal");
    await promise;
    expect(settings.getCollection(shelvesCollection).get("Work")).toBeUndefined();
    expect(settings.getCollection(shelvesCollection).get("Personal")?.journals).toEqual(["daily"]);
  });

  it("leaves the shelf in place when the modal is cancelled", async () => {
    const raw = { version: 3, shelves: { Work: { name: "Work", journals: [] } } };
    const { flows, modals, settings } = await build(raw);
    const promise = flows.invoke(DeleteShelfFlow, { shelfName: "Work" });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(settings.getCollection(shelvesCollection).get("Work")).toBeDefined();
  });
});
