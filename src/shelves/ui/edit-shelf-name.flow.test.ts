import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { journalConfigCollection } from "@/journals";
import { JournalLifecycleService } from "@/journals/settings/lifecycle";
import { createSettingsService } from "@/settings/testing";

import { shelvesCollection } from "../config";
import { ShelvesLifecycleService } from "../lifecycle";

import { EditShelfNameFlow } from "./edit-shelf-name.flow";

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
  container.register(EditShelfNameFlow).useClass(EditShelfNameFlow);
  return { settings, modals, flows: container.resolve(Flows) };
}

describe("EditShelfNameFlow", () => {
  it("creates a shelf when no shelf name is given", async () => {
    const { flows, modals, settings } = await build();
    const promise = flows.invoke(EditShelfNameFlow, {});
    modals.lastOpen<unknown, string>().submit("Work");
    await promise;
    expect(settings.getCollection(shelvesCollection).get("Work")).toEqual({ name: "Work", journals: [] });
  });

  it("renames an existing shelf and keeps its journals", async () => {
    const raw = { version: 3, shelves: { Work: { name: "Work", journals: ["daily"] } } };
    const { flows, modals, settings } = await build(raw);
    const promise = flows.invoke(EditShelfNameFlow, { shelfName: "Work" });
    modals.lastOpen<unknown, string>().submit("Office");
    await promise;
    expect(settings.getCollection(shelvesCollection).get("Work")).toBeUndefined();
    expect(settings.getCollection(shelvesCollection).get("Office")).toEqual({
      name: "Office",
      journals: ["daily"],
    });
  });

  it("leaves the collection untouched when the modal is cancelled", async () => {
    const { flows, modals, settings } = await build();
    const promise = flows.invoke(EditShelfNameFlow, {});
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(Object.keys(settings.getCollection(shelvesCollection).entries)).toEqual([]);
  });
});
