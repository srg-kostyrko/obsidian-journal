import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/vue";
import { createNanoEvents } from "nanoevents";
import { __testing as obsidianTesting } from "obsidian";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";

import { Container, provideInjectorOnApp } from "@/infrastructure/di";
import { ShelvesRepository } from "@/shelves";
import type { ShelfConfig, ShelvesEvents } from "@/shelves";

import { provideViewContextStub } from "../../testing";
import { provideViewContext, type ViewContext } from "../../view-context";

import { shelfSelectorItem } from "./shelf-selector-item";

import type { BlockInstanceId } from "../../config";

afterEach(() => cleanup());

function makeShelves(names: readonly string[]): ShelvesRepository {
  const storage: Record<string, ShelfConfig> = {};
  for (const name of names) {
    storage[name] = { name, journals: [] };
  }
  return ShelvesRepository.fromParts(storage, createNanoEvents<ShelvesEvents>());
}

const renderRoot = (): ReturnType<typeof h> =>
  h(shelfSelectorItem.component, { instanceId: "i-1" as BlockInstanceId, config: {} });

function mountItem(shelves: ShelvesRepository, contextOverride: Partial<ViewContext>) {
  const container = new Container();
  container.register(ShelvesRepository).useValue(shelves);
  const context = provideViewContextStub(contextOverride);
  const Wrapper = defineComponent({
    setup() {
      provideViewContext(context);
      return renderRoot;
    },
  });
  const result = render(Wrapper, {
    global: { plugins: [{ install: (app) => provideInjectorOnApp(app, container) }] },
  });
  return { result, context };
}

describe("ShelfSelectorItem", () => {
  describe("rendering", () => {
    it("renders 'All journals' when context.shelf is null", () => {
      mountItem(makeShelves(["work"]), { shelf: ref(null) });
      expect(screen.getByText("All journals")).toBeTruthy();
    });

    it("renders the shelf name when context.shelf is set", () => {
      mountItem(makeShelves(["work"]), { shelf: ref("work") });
      expect(screen.getByText("work")).toBeTruthy();
    });
  });

  describe("click", () => {
    it("opens an obsidian Menu with one entry per shelf plus 'All journals'", async () => {
      mountItem(makeShelves(["work", "home"]), { shelf: ref(null) });
      await userEvent.click(screen.getByText("All journals"));
      const menu = obsidianTesting.lastOpenMenu();
      expect(menu.items.map((i) => i.title)).toEqual(["All journals", "work", "home"]);
    });

    it("calls setShelf with the chosen name when a shelf is picked", async () => {
      const setShelf = vi.fn();
      mountItem(makeShelves(["work"]), { shelf: ref(null), setShelf });
      await userEvent.click(screen.getByText("All journals"));
      const menu = obsidianTesting.lastOpenMenu();
      (menu.items[1] as unknown as { click(): void }).click();
      expect(setShelf).toHaveBeenCalledWith("work");
    });

    it("calls setShelf(null) when 'All journals' is picked", async () => {
      const setShelf = vi.fn();
      mountItem(makeShelves(["work"]), { shelf: ref("work"), setShelf });
      await userEvent.click(screen.getByText("work"));
      const menu = obsidianTesting.lastOpenMenu();
      (menu.items[0] as unknown as { click(): void }).click();
      expect(setShelf).toHaveBeenCalledWith(null);
    });
  });
});
