import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
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

import ToolbarStrip from "./ToolbarStrip.vue";

import type { BlockInstanceId, ViewId } from "../config";
import type { ToolbarItemDefinition } from "../define-toolbar-item";
import type { ViewBlockDefinition } from "../define-view-block";

vi.mock("./use-sortable-list", () => ({ useSortableList: () => undefined }));

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

const buttonDefinition = {
  key: "button",
  label: "Button",
  icon: "square",
  schema: v.object({ label: v.optional(v.string()) }),
  defaultConfig: {},
  component: { render: () => null },
  configComponent: { render: () => null },
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
  container.register(ToolbarItemDefinitionToken).useValue(buttonDefinition);
  container.register(ViewsRepository).useClass(ViewsRepository);
  container.register(ToolbarItemsService).useClass(ToolbarItemsService);
  container.register(ViewsService).useClass(ViewsService);
  container.register(ViewsViewModel).useClass(ViewsViewModel);
  container.register(Flows).useClass(Flows);
  container.register(AddToolbarItemToBlockFlow).useClass(AddToolbarItemToBlockFlow);
  return { container };
}

function mount(container: Container) {
  return render(ToolbarStrip, {
    props: { viewId, blockId },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

describe("ToolbarStrip", () => {
  it("shows the empty state when the toolbar has no items", async () => {
    const { container } = await setup([]);
    mount(container);
    expect(screen.getByText(m.view_toolbar_item_empty())).toBeTruthy();
  });

  it("renders a frame per toolbar item", async () => {
    const { container } = await setup([
      { id: itemIdA, key: "shelf-selector", config: {} },
      { id: itemIdB, key: "button", config: {} },
    ]);
    mount(container);
    expect(screen.getAllByLabelText(m.view_toolbar_item_remove())).toHaveLength(2);
  });

  it("removes an item when its delete button is clicked", async () => {
    const { container } = await setup([{ id: itemIdA, key: "shelf-selector", config: {} }]);
    mount(container);
    await userEvent.click(screen.getByLabelText(m.view_toolbar_item_remove()));
    const repo = container.resolve(ViewsRepository);
    const items = (repo.get(viewId).getOr(undefined as never)?.blocks[0]?.config as { items: unknown[] }).items;
    expect(items).toEqual([]);
  });

  it("invokes AddToolbarItemToBlockFlow when Add is clicked", async () => {
    const { container } = await setup([]);
    mount(container);
    const flows = container.resolve(Flows);
    const spy = vi.spyOn(flows, "invoke").mockReturnValue({ tap: () => undefined } as never);
    await userEvent.click(screen.getByText(m.view_add_toolbar_item()));
    expect(spy).toHaveBeenCalledWith(AddToolbarItemToBlockFlow, { viewId, blockId });
  });

  it("persists the edited config when the edit modal is saved", async () => {
    const { container } = await setup([{ id: itemIdA, key: "button", config: { label: "A" } }]);
    mount(container);
    await userEvent.click(screen.getByLabelText(m.view_toolbar_item_edit()));
    const modals = container.resolve(ModalService) as unknown as FakeModalService;
    modals.lastOpen<unknown, Record<string, unknown>>().submit({ label: "B" });
    const repo = container.resolve(ViewsRepository);
    await waitFor(() => {
      const items = (
        repo.get(viewId).getOr(undefined as never)?.blocks[0]?.config as { items: { config: { label?: string } }[] }
      ).items;
      expect(items[0]?.config.label).toBe("B");
    });
  });
});
