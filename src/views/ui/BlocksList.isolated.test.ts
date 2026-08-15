import userEvent from "@testing-library/user-event";
import { cleanup, render, screen, waitFor } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import * as v from "valibot";
import { afterEach, describe, expect, it, vi } from "vitest";

import { m } from "@/i18n";
import { type Container, provideInjectorOnApp } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { NoticeService } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { FakeModalService } from "@/infrastructure/host/modals/testing";
import { FakeNoticeService } from "@/infrastructure/host/testing";
import { createSettingsService } from "@/settings/testing";
import { ShelvesEventsToken, type ShelvesEvents } from "@/shelves";

import { ToolbarItemsService } from "../blocks/toolbar/toolbar-items-service";
import { viewsCollection } from "../config";
import { AddToolbarItemToBlockFlow } from "../flows/add-toolbar-item-to-block.flow";
import { ViewsRepository } from "../repository";
import { ViewsService } from "../service";
import { ToolbarItemDefinitionToken, ViewBlockDefinitionToken, ViewsEventsToken } from "../tokens";
import { ViewsViewModel } from "../view-model";

import BlocksList from "./BlocksList.vue";

import type { BlockInstanceId, ViewId } from "../config";
import type { ToolbarItemDefinition } from "../define-toolbar-item";
import type { ViewBlockDefinition } from "../define-view-block";

vi.mock("./use-sortable-list", () => ({ useSortableList: () => ({ dragging: false }) }));

afterEach(() => cleanup());

const viewId = "11111111-1111-1111-1111-111111111111" as ViewId;
const blockIdA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" as BlockInstanceId;

const dividerDefinition = {
  key: "divider",
  label: () => "Divider block",
  icon: "minus",
  schema: v.object({}),
  defaultConfig: {},
  component: { render: () => null },
} as unknown as ViewBlockDefinition;

const toolbarBlockDefinition = {
  key: "toolbar",
  label: () => "Toolbar",
  schema: v.object({ items: v.array(v.unknown()) }),
  defaultConfig: { items: [] },
  component: { render: () => null },
} as unknown as ViewBlockDefinition;

const calendarDefinition = {
  key: "week-calendar",
  label: () => "Week calendar",
  icon: "calendar",
  schema: v.object({ weeks: v.optional(v.string()) }),
  defaultConfig: { weeks: "left" },
  component: { render: () => null },
  configComponent: { render: () => null },
} as unknown as ViewBlockDefinition;

const stubToolbarItemDefinition = {
  key: "stub-item",
  label: () => "Stub item",
  schema: v.object({}),
  defaultConfig: {},
  component: { render: () => null },
  __brand: "toolbar-item",
} as unknown as ToolbarItemDefinition;

async function setup(blocks: { id: string; key: string; config: Record<string, unknown> }[]) {
  const raw = {
    version: 5,
    views: {
      [viewId]: { id: viewId, name: "Weekly", icon: "calendar-days", defaultShelf: null, showInRibbon: false, blocks },
    },
  };
  const { service: settings, container } = createSettingsService({ collections: [viewsCollection], raw });
  await settings.initialize();
  container.register(ModalService).useValue(new FakeModalService() as unknown as ModalService);
  container.register(ViewsEventsToken).useFactory(() => createNanoEvents());
  container.register(ViewBlockDefinitionToken).useValue(dividerDefinition);
  container.register(ViewBlockDefinitionToken).useValue(calendarDefinition);
  container.register(ViewsRepository).useClass(ViewsRepository);
  container.register(ToolbarItemsService).useClass(ToolbarItemsService);
  container.register(ShelvesEventsToken).useValue(createNanoEvents<ShelvesEvents>());
  container.register(ViewsService).useClass(ViewsService);
  container.register(ViewsViewModel).useClass(ViewsViewModel);
  container.register(NoticeService).useValue(new FakeNoticeService());
  container.register(Flows).useClass(Flows);
  return { container };
}

async function setupWithToolbar(blocks: { id: string; key: string; config: Record<string, unknown> }[]) {
  const { container } = await setup(blocks);
  container.register(ViewBlockDefinitionToken).useValue(toolbarBlockDefinition);
  container.register(ToolbarItemDefinitionToken).useValue(stubToolbarItemDefinition);
  container.register(AddToolbarItemToBlockFlow).useClass(AddToolbarItemToBlockFlow);
  return { container };
}

function mount(container: Container) {
  return render(BlocksList, {
    props: { viewId },
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
}

describe("BlocksList", () => {
  it("shows the empty state when the view has no blocks", async () => {
    const { container } = await setup([]);
    mount(container);
    expect(screen.getByText(m.view_edit_blocks_empty())).toBeTruthy();
  });

  it("renders the definition label for known block keys", async () => {
    const { container } = await setup([{ id: blockIdA, key: "divider", config: {} }]);
    mount(container);
    expect(screen.getByText("Divider block")).toBeTruthy();
  });

  it("renders an unknown-key fallback label", async () => {
    const { container } = await setup([{ id: blockIdA, key: "month-calendar", config: {} }]);
    mount(container);
    expect(screen.getByText(m.view_block_unknown_label({ key: "month-calendar" }))).toBeTruthy();
  });

  it("removes a block when the remove button is clicked", async () => {
    const { container } = await setup([{ id: blockIdA, key: "divider", config: {} }]);
    mount(container);
    await userEvent.click(screen.getByLabelText(m.view_block_remove()));
    const repo = container.resolve(ViewsRepository);
    expect(repo.get(viewId).getOr(undefined as never)?.blocks).toEqual([]);
  });

  it("renders a ToolbarStrip when a block's key is 'toolbar'", async () => {
    const { container } = await setupWithToolbar([{ id: blockIdA, key: "toolbar", config: { items: [] } }]);
    mount(container);
    expect(screen.getByText(m.view_toolbar_item_empty())).toBeTruthy();
  });

  it("renders a block's config summary", async () => {
    const summaryDefinition = {
      key: "with-summary",
      label: () => "Summary block",
      schema: v.object({}),
      defaultConfig: {},
      component: { render: () => null },
      summary: () => "the summary",
    } as unknown as ViewBlockDefinition;
    const { container } = await setup([{ id: blockIdA, key: "with-summary", config: {} }]);
    container.register(ViewBlockDefinitionToken).useValue(summaryDefinition);
    mount(container);
    expect(screen.getByText("the summary")).toBeTruthy();
  });

  describe("editing a block's config", () => {
    it("offers an edit button for blocks whose definition has a config editor", async () => {
      const { container } = await setup([{ id: blockIdA, key: "week-calendar", config: { weeks: "left" } }]);
      mount(container);
      expect(screen.getByLabelText(m.view_block_edit())).toBeTruthy();
    });

    it("offers no edit button for blocks without a config editor", async () => {
      const { container } = await setup([{ id: blockIdA, key: "divider", config: {} }]);
      mount(container);
      expect(screen.queryByLabelText(m.view_block_edit())).toBeNull();
    });

    it("persists the edited config when the edit modal is saved", async () => {
      const { container } = await setup([{ id: blockIdA, key: "week-calendar", config: { weeks: "left" } }]);
      mount(container);
      await userEvent.click(screen.getByLabelText(m.view_block_edit()));
      const modals = container.resolve(ModalService) as unknown as FakeModalService;
      modals.lastOpen<unknown, Record<string, unknown>>().submit({ weeks: "right" });
      const repo = container.resolve(ViewsRepository);
      await waitFor(() => {
        const block = repo
          .get(viewId)
          .getOr(undefined as never)
          ?.blocks.find((b) => b.id === blockIdA);
        expect((block?.config as { weeks?: string }).weeks).toBe("right");
      });
    });
  });
});
