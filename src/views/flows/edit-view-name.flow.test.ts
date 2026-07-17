import { createNanoEvents } from "nanoevents";
import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { NoticeService } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import { createSettingsService } from "@/settings/testing";
import { ShelvesEventsToken, type ShelvesEvents } from "@/shelves";

import { ToolbarItemsService } from "../blocks/toolbar/toolbar-items-service";
import { viewsCollection } from "../config";
import { ViewsRepository } from "../repository";
import { ViewsService } from "../service";
import { ViewsEventsToken } from "../tokens";
import { ViewsViewModel } from "../view-model";

import { EditViewNameFlow } from "./edit-view-name.flow";

import type { ViewId } from "../config";

async function build(raw?: unknown) {
  const { service: settings, container } = createSettingsService({
    collections: [viewsCollection],
    raw,
  });
  await settings.initialize();
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(ViewsEventsToken).useFactory(() => createNanoEvents());
  container.register(ViewsRepository).useClass(ViewsRepository);
  container.register(ToolbarItemsService).useClass(ToolbarItemsService);
  container.register(ShelvesEventsToken).useValue(createNanoEvents<ShelvesEvents>());
  container.register(ViewsService).useClass(ViewsService);
  container.register(ViewsViewModel).useClass(ViewsViewModel);
  container.register(NoticeService).useValue(new FakeNoticeService());
  container.register(Flows).useClass(Flows);
  container.register(EditViewNameFlow).useClass(EditViewNameFlow);
  return { repo: container.resolve(ViewsRepository), modals, flows: container.resolve(Flows) };
}

describe("EditViewNameFlow", () => {
  it("creates a new view with the entered name", async () => {
    const { flows, modals, repo } = await build();
    const promise = flows.invoke(EditViewNameFlow, {});
    modals.lastOpen<unknown, string>().submit("Weekly");
    const result = await promise;
    expect(result.kind).toBe("ok");
    expect(
      repo
        .find()
        .filter((v) => v.name === "Weekly")
        .first()
        .isSome(),
    ).toBe(true);
  });

  it("renames an existing view", async () => {
    const id = "11111111-1111-1111-1111-111111111111" as ViewId;
    const raw = {
      version: 4,
      views: {
        [id]: { id, name: "Old", icon: "calendar-days", defaultShelf: null, showInRibbon: false, blocks: [] },
      },
    };
    const { flows, modals, repo } = await build(raw);
    const promise = flows.invoke(EditViewNameFlow, { viewId: id });
    modals.lastOpen<unknown, string>().submit("New");
    await promise;
    expect(repo.get(id).getOr(undefined as never)?.name).toBe("New");
  });

  it("returns UserAborted when the modal is cancelled", async () => {
    const { flows, modals } = await build();
    const promise = flows.invoke(EditViewNameFlow, {});
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
  });
});
