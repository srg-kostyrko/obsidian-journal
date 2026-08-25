import userEvent from "@testing-library/user-event";
import { waitFor } from "@testing-library/vue";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";

import { m } from "@/i18n";
import { Flows } from "@/infrastructure/flows";
import { journalsCoreModule } from "@/journals/module";
import { notesCalendarModule } from "@/notes-calendar/module";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";

import { AddToolbarItemToBlockFlow } from "../flows/add-toolbar-item-to-block.flow";
import { viewsCoreModule } from "../module";
import { ViewsRepository } from "../repository";
import { provideViewContextStub } from "../testing";
import { buttonConfigFor } from "../toolbar-items/button/button-config";
import { buttonItem } from "../toolbar-items/button/button-item";
import { existingNavigationItem } from "../toolbar-items/existing-navigation/existing-navigation-item";
import { provideViewContext } from "../view-context";

import ToolbarStrip from "./ToolbarStrip.vue";

import type { BlockInstanceId, View, ViewId } from "../config";

const MODULES = [journalsCoreModule, shelvesCoreModule, viewsCoreModule, notesCalendarModule];

const VIEW_ID = "11111111-1111-4111-8111-111111111111" as ViewId;
const BLOCK_ID = "22222222-2222-4222-8222-222222222222" as BlockInstanceId;
const ITEM_A = "33333333-3333-4333-8333-333333333333" as BlockInstanceId;

const renderRoot = () => h(ToolbarStrip, { viewId: VIEW_ID, blockId: BLOCK_ID });

async function setup(items: { id: BlockInstanceId; key: string; config: Record<string, unknown> }[]) {
  const blocks: View["blocks"] = [{ id: BLOCK_ID, key: "toolbar", config: { items } }];
  const harness = await testContainer({
    modules: MODULES,
    data: {
      views: {
        [VIEW_ID]: {
          id: VIEW_ID,
          name: "Weekly",
          icon: "calendar-days",
          defaultShelf: null,
          showInRibbon: false,
          blocks,
        },
      },
    },
  });
  const context = provideViewContextStub();
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(context);
      return renderRoot;
    },
  });
  const result = harness.render(Wrapper);
  return { harness, ...result };
}

describe("ToolbarStrip", () => {
  it("shows the empty state when the toolbar has no items", async () => {
    const { getByText } = await setup([]);
    expect(getByText(m.view_toolbar_item_empty())).toBeTruthy();
  });

  it("renders a frame per toolbar item", async () => {
    const { getAllByLabelText } = await setup([
      { id: ITEM_A, key: "shelf-selector", config: {} },
      {
        id: "44444444-4444-4444-8444-444444444444" as BlockInstanceId,
        key: "button",
        config: buttonItem.defaultConfig(),
      },
    ]);
    expect(getAllByLabelText(m.view_toolbar_item_remove())).toHaveLength(2);
  });

  it("removes an item when its delete button is clicked", async () => {
    const { harness, getByLabelText } = await setup([{ id: ITEM_A, key: "shelf-selector", config: {} }]);
    await userEvent.click(getByLabelText(m.view_toolbar_item_remove()));
    const repo = harness.resolve(ViewsRepository);
    const items = (repo.get(VIEW_ID).getOr(undefined as never)?.blocks[0]?.config as { items: unknown[] }).items;
    expect(items).toEqual([]);
  });

  it("invokes AddToolbarItemToBlockFlow when Add is clicked", async () => {
    const { harness, getByLabelText } = await setup([]);
    const flows = harness.resolve(Flows);
    const spy = vi.spyOn(flows, "invoke").mockReturnValue({ tap: () => undefined } as never);
    await userEvent.click(getByLabelText(m.view_add_toolbar_item()));
    expect(spy).toHaveBeenCalledWith(AddToolbarItemToBlockFlow, { viewId: VIEW_ID, blockId: BLOCK_ID });
  });

  it("titles the edit modal by qualifying the item type with its config-specific summary", async () => {
    const config = buttonConfigFor({ type: "pick-date", mode: "navigate", levels: ["day"] });
    const { harness, getByLabelText } = await setup([{ id: ITEM_A, key: "button", config }]);
    await userEvent.click(getByLabelText(m.view_toolbar_item_edit()));
    expect(harness.modals.lastOpen().resolvedTitle).toBe(
      m.view_toolbar_item_edit_title_detail({ type: buttonItem.label(), detail: m.common_pick_a_date() }),
    );
  });

  it("titles the edit modal with just the item type when it has no summary", async () => {
    const config = existingNavigationItem.defaultConfig();
    const { harness, getByLabelText } = await setup([{ id: ITEM_A, key: "existing-navigation", config }]);
    await userEvent.click(getByLabelText(m.view_toolbar_item_edit()));
    expect(harness.modals.lastOpen().resolvedTitle).toBe(
      m.view_toolbar_item_edit_title({ type: existingNavigationItem.label() }),
    );
  });

  it("persists the edited config when the edit modal is saved", async () => {
    const config = { ...buttonConfigFor({ type: "current", mode: "create", levels: ["day"] }), label: "A" };
    const { harness, getByLabelText } = await setup([{ id: ITEM_A, key: "button", config }]);
    await userEvent.click(getByLabelText(m.view_toolbar_item_edit()));
    harness.modals.lastOpen<unknown, Record<string, unknown>>().submit({ ...config, label: "B" });
    const repo = harness.resolve(ViewsRepository);
    await waitFor(() => {
      const items = (
        repo.get(VIEW_ID).getOr(undefined as never)?.blocks[0]?.config as { items: { config: { label?: string } }[] }
      ).items;
      expect(items[0]?.config.label).toBe("B");
    });
  });
});
