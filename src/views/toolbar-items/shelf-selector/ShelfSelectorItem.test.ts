import userEvent from "@testing-library/user-event";
import { screen } from "@testing-library/vue";
import { __testing as obsidianTesting } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";

import { m } from "@/i18n";
import { journalsCoreModule } from "@/journals/module";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { testContainer } from "@/testing";

import { provideViewContextStub } from "../../testing";
import { provideViewContext, type ViewContext } from "../../view-context";

import { shelfSelectorItem } from "./shelf-selector-item";

import type { BlockInstanceId } from "../../config";

const renderRoot = (): ReturnType<typeof h> =>
  h(shelfSelectorItem.component, { instanceId: "i-1" as BlockInstanceId, config: {} });

async function mountItem(names: readonly string[], contextOverride: Partial<ViewContext>) {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule],
    data: { shelves: Object.fromEntries(names.map((name) => [name, buildShelf(name)])) },
  });
  const context = provideViewContextStub(contextOverride);
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(context);
      return renderRoot;
    },
  });
  const result = harness.render(Wrapper);
  return { result, context };
}

describe("ShelfSelectorItem", () => {
  describe("rendering", () => {
    it("renders 'All journals' when context.shelf is null", async () => {
      await mountItem(["work"], { shelf: ref(null) });
      expect(screen.getByText("All journals")).toBeTruthy();
    });

    it("renders the shelf name when context.shelf is set", async () => {
      await mountItem(["work"], { shelf: ref("work") });
      expect(screen.getByText("work")).toBeTruthy();
    });

    it("renders nothing when there are no shelves", async () => {
      await mountItem([], { shelf: ref(null) });
      expect(screen.queryByText("All journals")).toBeNull();
    });
  });

  describe("assistive tech", () => {
    it("announces the active shelf as its name rather than the action", async () => {
      await mountItem(["work"], { shelf: ref("work") });
      expect(screen.getByRole("button", { name: "work" })).toBeTruthy();
    });

    it("keeps the switch-shelf hint as a tooltip", async () => {
      await mountItem(["work"], { shelf: ref("work") });
      expect(screen.getByRole("button", { name: "work" }).dataset.tooltip).toBe(
        m.view_toolbar_shelf_selector_tooltip(),
      );
    });

    it("declares that it opens a menu", async () => {
      await mountItem(["work"], { shelf: ref("work") });
      expect(screen.getByRole("button", { name: "work" }).getAttribute("aria-haspopup")).toBe("menu");
    });
  });

  describe("click", () => {
    it("opens an obsidian Menu with one entry per shelf plus 'All journals'", async () => {
      await mountItem(["work", "home"], { shelf: ref(null) });
      await userEvent.click(screen.getByText("All journals"));
      const menu = obsidianTesting.lastOpenMenu();
      expect(menu.items.map((i) => i.title)).toEqual(["All journals", "work", "home"]);
    });

    it("calls setShelf with the chosen name when a shelf is picked", async () => {
      const setShelf = vi.fn();
      await mountItem(["work"], { shelf: ref(null), setShelf });
      await userEvent.click(screen.getByText("All journals"));
      const menu = obsidianTesting.lastOpenMenu();
      (menu.items[1] as unknown as { click(): void }).click();
      expect(setShelf).toHaveBeenCalledWith("work");
    });

    it("calls setShelf(null) when 'All journals' is picked", async () => {
      const setShelf = vi.fn();
      await mountItem(["work"], { shelf: ref("work"), setShelf });
      await userEvent.click(screen.getByText("work"));
      const menu = obsidianTesting.lastOpenMenu();
      (menu.items[0] as unknown as { click(): void }).click();
      expect(setShelf).toHaveBeenCalledWith(null);
    });
  });
});
