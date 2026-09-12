import userEvent from "@testing-library/user-event";
import { screen, waitFor } from "@testing-library/vue";
import { describe, expect, it } from "vitest";

import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer } from "@/testing";

import { viewsCoreModule } from "../module";
import { ViewsRepository } from "../repository";

import BlocksList from "./BlocksList.vue";

import type { BlockInstanceId, View, ViewId } from "../config";

const MODULES = [journalsCoreModule, shelvesCoreModule, viewsCoreModule];

const VIEW_ID = "11111111-1111-4111-8111-111111111111" as ViewId;
const BLOCK_A = "22222222-2222-4222-8222-222222222222" as BlockInstanceId;
const ITEM_A = "33333333-3333-4333-8333-333333333333" as BlockInstanceId;

async function setup(blocks: View["blocks"]) {
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
  const result = harness.render(BlocksList, { props: { viewId: VIEW_ID } });
  return { harness, ...result };
}

describe("BlocksList", () => {
  it("shows the empty state when the view has no blocks", async () => {
    await setup([]);
    expect(screen.getByText(m.view_edit_blocks_empty())).toBeTruthy();
  });

  it("renders the definition label for known block keys", async () => {
    await setup([{ id: BLOCK_A, key: "divider", config: {} }]);
    expect(screen.getByText(m.view_block_divider_label())).toBeTruthy();
  });

  it("renders an unknown-key fallback label", async () => {
    await setup([{ id: BLOCK_A, key: "not-a-real-block", config: {} }]);
    expect(screen.getByText(m.view_block_unknown_label({ key: "not-a-real-block" }))).toBeTruthy();
  });

  it("removes a block when the remove button is clicked", async () => {
    const { harness } = await setup([{ id: BLOCK_A, key: "divider", config: {} }]);
    await userEvent.click(screen.getByLabelText(m.view_block_remove()));
    const repo = harness.resolve(ViewsRepository);
    expect(repo.get(VIEW_ID).getOr(undefined as never)?.blocks).toEqual([]);
  });

  it("renders a ToolbarStrip when a block's key is 'toolbar'", async () => {
    await setup([{ id: BLOCK_A, key: "toolbar", config: { items: [] } }]);
    expect(screen.getByText(m.view_toolbar_item_empty())).toBeTruthy();
  });

  it("renders a block's config summary", async () => {
    await setup([
      { id: BLOCK_A, key: "toolbar", config: { items: [{ id: ITEM_A, key: "shelf-selector", config: {} }] } },
    ]);
    expect(screen.getByText(m.view_block_toolbar_item_count({ count: 1 }))).toBeTruthy();
  });

  describe("editing a block's config", () => {
    const weekConfig = { before: 0, after: 0, hiddenWeekdays: [], weeks: "left", showHeading: true };

    it("offers an edit button for blocks whose definition has a config editor", async () => {
      await setup([{ id: BLOCK_A, key: "week-calendar", config: weekConfig }]);
      expect(screen.getByLabelText(m.view_block_edit())).toBeTruthy();
    });

    it("offers no edit button for blocks without a config editor", async () => {
      await setup([{ id: BLOCK_A, key: "divider", config: {} }]);
      expect(screen.queryByLabelText(m.view_block_edit())).toBeNull();
    });

    it("persists the edited config when the edit modal is saved", async () => {
      const { harness } = await setup([{ id: BLOCK_A, key: "week-calendar", config: weekConfig }]);
      await userEvent.click(screen.getByLabelText(m.view_block_edit()));
      harness.modals.lastOpen<unknown, Record<string, unknown>>().submit({ ...weekConfig, weeks: "right" });
      const repo = harness.resolve(ViewsRepository);
      await waitFor(() => {
        const block = repo
          .get(VIEW_ID)
          .getOr(undefined as never)
          ?.blocks.find((b) => b.id === BLOCK_A);
        expect((block?.config as { weeks?: string }).weeks).toBe("right");
      });
    });
  });
});
