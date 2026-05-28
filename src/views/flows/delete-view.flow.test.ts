import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { createSettingsService } from "@/settings/testing";

import { viewsCollection } from "../config";
import { ViewsRepository } from "../repository";
import { ViewsService } from "../service";
import { ViewsEventsToken } from "../tokens";
import { ViewsViewModel } from "../view-model";

import { DeleteViewFlow } from "./delete-view.flow";

import type { ViewId } from "../config";

async function build() {
  const id = "11111111-1111-1111-1111-111111111111" as ViewId;
  const raw = {
    version: 3,
    views: {
      [id]: { id, name: "Weekly", icon: "calendar-days", defaultShelf: null, showInRibbon: false, blocks: [] },
    },
  };
  const { service: settings, container } = createSettingsService({ collections: [viewsCollection], raw });
  await settings.initialize();
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(ViewsEventsToken).useFactory(() => createNanoEvents());
  container.register(ViewsRepository).useClass(ViewsRepository);
  container.register(ViewsService).useClass(ViewsService);
  container.register(ViewsViewModel).useClass(ViewsViewModel);
  container.register(Flows).useClass(Flows);
  container.register(DeleteViewFlow).useClass(DeleteViewFlow);
  return { id, repo: container.resolve(ViewsRepository), modals, flows: container.resolve(Flows) };
}

describe("DeleteViewFlow", () => {
  it("deletes the view on submit", async () => {
    const { id, flows, modals, repo } = await build();
    const promise = flows.invoke(DeleteViewFlow, { viewId: id });
    modals.lastOpen<unknown, void>().submit(undefined);
    await promise;
    expect(repo.get(id).isNone()).toBe(true);
  });

  it("returns UserAborted when the modal is cancelled", async () => {
    const { id, flows, modals, repo } = await build();
    const promise = flows.invoke(DeleteViewFlow, { viewId: id });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
    expect(repo.get(id).isSome()).toBe(true);
  });
});
