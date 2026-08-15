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
import type { ViewNameModalResult } from "../ui/modals";

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
    modals.lastOpen<unknown, ViewNameModalResult>().submit({ name: "Weekly", icon: "calendar-days" });
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

  it("creates a new view with the chosen icon", async () => {
    const { flows, modals, repo } = await build();
    const promise = flows.invoke(EditViewNameFlow, {});
    modals.lastOpen<unknown, ViewNameModalResult>().submit({ name: "Weekly", icon: "calendar-days" });
    await promise;
    expect(
      repo
        .find()
        .filter((v) => v.name === "Weekly")
        .first()
        .map((v) => v.icon)
        .getOrUndefined(),
    ).toBe("calendar-days");
  });

  it("renames an existing view", async () => {
    const id = "11111111-1111-1111-1111-111111111111" as ViewId;
    const raw = {
      version: 5,
      views: {
        [id]: { id, name: "Old", icon: "calendar-days", defaultShelf: null, showInRibbon: false, blocks: [] },
      },
    };
    const { flows, modals, repo } = await build(raw);
    const promise = flows.invoke(EditViewNameFlow, { viewId: id });
    modals.lastOpen<unknown, ViewNameModalResult>().submit({ name: "New", icon: "" });
    await promise;
    expect(repo.get(id).getOrUndefined()?.name).toBe("New");
  });

  it("keeps the existing icon when renaming", async () => {
    const id = "11111111-1111-1111-1111-111111111111" as ViewId;
    const raw = {
      version: 5,
      views: {
        [id]: { id, name: "Old", icon: "calendar-days", defaultShelf: null, showInRibbon: false, blocks: [] },
      },
    };
    const { flows, modals, repo } = await build(raw);
    const promise = flows.invoke(EditViewNameFlow, { viewId: id });
    modals.lastOpen<unknown, ViewNameModalResult>().submit({ name: "New", icon: "" });
    await promise;
    expect(repo.get(id).getOrUndefined()?.icon).toBe("calendar-days");
  });

  it("returns UserAborted when the modal is cancelled", async () => {
    const { flows, modals } = await build();
    const promise = flows.invoke(EditViewNameFlow, {});
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
  });
});
