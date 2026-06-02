import { createNanoEvents } from "nanoevents";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { Flows, UserAborted } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { createSettingsService } from "@/settings/testing";

import { viewsCollection } from "../config";
import { UnknownToolbarItemKeyError } from "../errors";
import { ViewsRepository } from "../repository";
import { ViewsService } from "../service";
import { ToolbarItemDefinitionToken, ViewBlockDefinitionToken, ViewsEventsToken } from "../tokens";

import { AddToolbarItemToBlockFlow } from "./add-toolbar-item-to-block.flow";

import type { BlockInstanceId, ViewId } from "../config";
import type { ToolbarItemDefinition } from "../define-toolbar-item";
import type { ViewBlockDefinition } from "../define-view-block";

const viewId = "11111111-1111-1111-1111-111111111111" as ViewId;
const blockId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as BlockInstanceId;

const toolbarBlockDefinition = {
  key: "toolbar",
  label: "Toolbar",
  schema: v.object({ items: v.array(v.unknown()) }),
  defaultConfig: { items: [] },
  component: { render: () => null },
} as unknown as ViewBlockDefinition;

const shelfSelectorDefinition = {
  key: "shelf-selector",
  label: "Shelf selector",
  schema: v.object({}),
  defaultConfig: {},
  component: { render: () => null },
  __brand: "toolbar-item",
} as unknown as ToolbarItemDefinition;

async function build(withDefinition = true) {
  const raw = {
    version: 4,
    views: {
      [viewId]: {
        id: viewId,
        name: "Weekly",
        icon: "calendar-days",
        defaultShelf: null,
        showInRibbon: false,
        blocks: [{ id: blockId, key: "toolbar", config: { items: [] } }],
      },
    },
  };
  const { service: settings, container } = createSettingsService({ collections: [viewsCollection], raw });
  await settings.initialize();
  const modals = new FakeModalService();
  container.register(ModalService).useValue(modals as unknown as ModalService);
  container.register(ViewsEventsToken).useFactory(() => createNanoEvents());
  container.register(ViewBlockDefinitionToken).useValue(toolbarBlockDefinition);
  if (withDefinition) {
    container.register(ToolbarItemDefinitionToken).useValue(shelfSelectorDefinition);
  }
  container.register(ViewsRepository).useClass(ViewsRepository);
  container.register(ViewsService).useClass(ViewsService);
  container.register(Flows).useClass(Flows);
  container.register(AddToolbarItemToBlockFlow).useClass(AddToolbarItemToBlockFlow);
  return { repo: container.resolve(ViewsRepository), modals, flows: container.resolve(Flows) };
}

describe("AddToolbarItemToBlockFlow", () => {
  it("opens the picker modal then adds the chosen item to the block", async () => {
    const { flows, modals, repo } = await build();
    const promise = flows.invoke(AddToolbarItemToBlockFlow, { viewId, blockId });
    modals
      .lastOpen<unknown, { key: string; defaultConfig: unknown }>()
      .submit({ key: "shelf-selector", defaultConfig: {} });
    await promise;
    const rawConfig =
      repo
        .get(viewId)
        .getOr(undefined as never)
        ?.blocks.find((b) => b.id === blockId)?.config ?? {};
    const items = Array.isArray(rawConfig.items) ? (rawConfig.items as { key: string }[]) : [];
    expect(items.map((i) => i.key)).toEqual(["shelf-selector"]);
  });

  it("aborts with UserAborted when the picker is cancelled", async () => {
    const { flows, modals } = await build();
    const promise = flows.invoke(AddToolbarItemToBlockFlow, { viewId, blockId });
    modals.lastOpen().cancel();
    const result = await promise;
    expect(result.kind === "err" && result.error).toBeInstanceOf(UserAborted);
  });

  it("surfaces UnknownToolbarItemKeyError as a flow error when the chosen key is unregistered", async () => {
    const { flows, modals } = await build(false);
    const promise = flows.invoke(AddToolbarItemToBlockFlow, { viewId, blockId });
    modals
      .lastOpen<unknown, { key: string; defaultConfig: unknown }>()
      .submit({ key: "unknown-item", defaultConfig: {} });
    const result = await promise;
    expect(result.kind === "err" && result.error.cause).toBeInstanceOf(UnknownToolbarItemKeyError);
  });
});
