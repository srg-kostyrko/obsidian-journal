import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { NoticeService } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import { createSettingsService } from "@/settings/testing";

import { shelvesCollection } from "../config";
import { ShelvesRepository } from "../repository";
import { ShelvesEventsToken } from "../tokens";

import { EditShelfNameFlow } from "./edit-shelf-name.flow";

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
  container.register(NoticeService).useValue(new FakeNoticeService());
  container.register(Flows).useClass(Flows);
  container.register(EditShelfNameFlow).useClass(EditShelfNameFlow);
  const repo = container.resolve(ShelvesRepository);
  return { repo, modals, flows: container.resolve(Flows) };
}

describe("EditShelfNameFlow", () => {
  it("creates a shelf when no shelf name is given", async () => {
    const { flows, modals, repo } = await build();
    const promise = flows.invoke(EditShelfNameFlow, {});
    modals.lastOpen<unknown, string>().submit("Work");
    await promise;
    expect(repo.get("Work").getOr(undefined as never)).toEqual({ name: "Work", journals: [], decorations: [] });
  });

  it("renames an existing shelf and keeps its journals", async () => {
    const raw = { version: 4, shelves: { Work: { name: "Work", journals: ["daily"] } } };
    const { flows, modals, repo } = await build(raw);
    const promise = flows.invoke(EditShelfNameFlow, { shelfName: "Work" });
    modals.lastOpen<unknown, string>().submit("Office");
    await promise;
    expect(repo.get("Work").isNone()).toBe(true);
    expect(repo.get("Office").getOr(undefined as never)).toEqual({
      name: "Office",
      journals: ["daily"],
      decorations: [],
    });
  });

  it("leaves the collection untouched when the modal is cancelled", async () => {
    const { flows, modals, repo } = await build();
    const promise = flows.invoke(EditShelfNameFlow, {});
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(repo.count()).toBe(0);
  });
});
