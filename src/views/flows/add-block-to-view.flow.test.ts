import { createNanoEvents } from "nanoevents";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { NoticeService } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import { createSettingsService } from "@/settings/testing";

import { ToolbarItemsService } from "../blocks/toolbar/toolbar-items-service";
import { viewsCollection } from "../config";
import { ViewsRepository } from "../repository";
import { ViewsService } from "../service";
import { ViewBlockDefinitionToken, ViewsEventsToken } from "../tokens";

import { AddBlockToViewFlow } from "./add-block-to-view.flow";

import type { ViewId } from "../config";
import type { ViewBlockDefinition } from "../define-view-block";

const id = "11111111-1111-1111-1111-111111111111" as ViewId;

const dividerDefinition = {
  key: "divider",
  label: "Divider",
  schema: v.object({}),
  defaultConfig: {},
  component: { render: () => null },
} as unknown as ViewBlockDefinition;

async function build() {
  const raw = {
    version: 4,
    views: {
      [id]: { id, name: "Weekly", icon: "calendar-days", defaultShelf: null, showInRibbon: false, blocks: [] },
    },
  };
  const { service: settings, container } = createSettingsService({ collections: [viewsCollection], raw });
  await settings.initialize();
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(ViewsEventsToken).useFactory(() => createNanoEvents());
  container.register(ViewBlockDefinitionToken).useValue(dividerDefinition);
  container.register(ViewsRepository).useClass(ViewsRepository);
  container.register(ToolbarItemsService).useClass(ToolbarItemsService);
  container.register(ViewsService).useClass(ViewsService);
  container.register(NoticeService).useValue(new FakeNoticeService());
  container.register(Flows).useClass(Flows);
  container.register(AddBlockToViewFlow).useClass(AddBlockToViewFlow);
  return { repo: container.resolve(ViewsRepository), modals, flows: container.resolve(Flows) };
}

describe("AddBlockToViewFlow", () => {
  it("appends the chosen block to the view", async () => {
    const { flows, modals, repo } = await build();
    const promise = flows.invoke(AddBlockToViewFlow, { viewId: id });
    modals.lastOpen<unknown, string>().submit("divider");
    await promise;
    expect(
      repo
        .get(id)
        .getOr(undefined as never)
        ?.blocks.map((b) => b.key),
    ).toEqual(["divider"]);
  });

  it("returns UserAborted when the modal is cancelled", async () => {
    const { flows, modals } = await build();
    const promise = flows.invoke(AddBlockToViewFlow, { viewId: id });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
  });
});
