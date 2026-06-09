import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import * as v from "valibot";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { createSettingsService } from "@/settings/testing";

import { ToolbarItemsService } from "../blocks/toolbar/toolbar-items-service";
import { viewsCollection } from "../config";
import { AddToolbarItemToBlockFlow } from "../flows/add-toolbar-item-to-block.flow";
import { ViewsRepository } from "../repository";
import { ViewsService } from "../service";
import { ToolbarItemDefinitionToken, ViewBlockDefinitionToken, ViewsEventsToken } from "../tokens";
import { ViewsViewModel } from "../view-model";

import ToolbarItemsList from "./ToolbarItemsList.vue";

import type { BlockInstanceId, ViewId } from "../config";
import type { ToolbarItemDefinition } from "../define-toolbar-item";
import type { ViewBlockDefinition } from "../define-view-block";

afterEach(() => cleanup());

const viewId = "11111111-1111-1111-1111-111111111111" as ViewId;
const blockId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as BlockInstanceId;
const itemIdA = "11111111-1111-1111-1111-aaaaaaaaaaaa" as BlockInstanceId;
const itemIdB = "11111111-1111-1111-1111-bbbbbbbbbbbb" as BlockInstanceId;

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
  icon: "layers",
  schema: v.object({}),
  defaultConfig: {},
  component: { render: () => null },
  __brand: "toolbar-item",
} as unknown as ToolbarItemDefinition;

async function setup(items: { id: BlockInstanceId; key: string; config: Record<string, unknown> }[]) {
  const raw = {
    version: 4,
    views: {
      [viewId]: {
        id: viewId,
        name: "Weekly",
        icon: "calendar-days",
        defaultShelf: null,
        showInRibbon: false,
        blocks: [{ id: blockId, key: "toolbar", config: { items } }],
      },
    },
  };
  const { service: settings, container } = createSettingsService({ collections: [viewsCollection], raw });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(ViewsEventsToken).useFactory(() => createNanoEvents());
  container.register(ViewBlockDefinitionToken).useValue(toolbarBlockDefinition);
  container.register(ToolbarItemDefinitionToken).useValue(shelfSelectorDefinition);
  container.register(ViewsRepository).useClass(ViewsRepository);
  container.register(ToolbarItemsService).useClass(ToolbarItemsService);
  container.register(ViewsService).useClass(ViewsService);
  container.register(ViewsViewModel).useClass(ViewsViewModel);
  container.register(Flows).useClass(Flows);
  container.register(AddToolbarItemToBlockFlow).useClass(AddToolbarItemToBlockFlow);
  return { container };
}

function mount(container: Container) {
  return render(ToolbarItemsList, {
    props: { viewId, blockId },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

describe("ToolbarItemsList", () => {
  it("shows the empty state when the toolbar block has no items", async () => {
    const { container } = await setup([]);
    mount(container);
    expect(screen.getByText(m.view_toolbar_item_empty())).toBeTruthy();
  });

  it("renders the definition label for each known item", async () => {
    const { container } = await setup([{ id: itemIdA, key: "shelf-selector", config: {} }]);
    mount(container);
    expect(screen.getByText("Shelf selector")).toBeTruthy();
  });

  it("renders an unknown-key fallback label", async () => {
    const { container } = await setup([{ id: itemIdA, key: "unknown-item", config: {} }]);
    mount(container);
    expect(screen.getByText(m.view_toolbar_item_unknown_label({ key: "unknown-item" }))).toBeTruthy();
  });

  it("removes an item when the remove button is clicked", async () => {
    const { container } = await setup([{ id: itemIdA, key: "shelf-selector", config: {} }]);
    mount(container);
    await userEvent.click(screen.getByLabelText(m.view_toolbar_item_remove()));
    const repo = container.resolve(ViewsRepository);
    const rawConfig =
      repo
        .get(viewId)
        .getOr(undefined as never)
        ?.blocks.find((b) => b.id === blockId)?.config ?? {};
    const items = Array.isArray(rawConfig.items) ? rawConfig.items : [];
    expect(items).toEqual([]);
  });

  it("disables Move up on the first row", async () => {
    const { container } = await setup([
      { id: itemIdA, key: "shelf-selector", config: {} },
      { id: itemIdB, key: "shelf-selector", config: {} },
    ]);
    mount(container);
    const upButtons = screen.getAllByLabelText(m.common_action_move_up());
    expect(upButtons[0]).toHaveProperty("disabled", true);
    expect(upButtons[1]).toHaveProperty("disabled", false);
  });

  it("disables Move down on the last row", async () => {
    const { container } = await setup([
      { id: itemIdA, key: "shelf-selector", config: {} },
      { id: itemIdB, key: "shelf-selector", config: {} },
    ]);
    mount(container);
    const downButtons = screen.getAllByLabelText(m.common_action_move_down());
    expect(downButtons[0]).toHaveProperty("disabled", false);
    expect(downButtons[1]).toHaveProperty("disabled", true);
  });

  it("invokes AddToolbarItemToBlockFlow when Add item is clicked", async () => {
    const { container } = await setup([]);
    mount(container);
    const flows = container.resolve(Flows);
    const spy = vi.spyOn(flows, "invoke").mockReturnValue({ tap: () => undefined } as never);
    await userEvent.click(screen.getByText(m.view_add_toolbar_item()));
    expect(spy).toHaveBeenCalledWith(AddToolbarItemToBlockFlow, { viewId, blockId });
  });
});
