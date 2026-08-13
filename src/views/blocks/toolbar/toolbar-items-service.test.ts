import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { Container } from "@/infrastructure/di";
import { createLoggerTestingModule } from "@/infrastructure/logger/testing";
import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { defineToolbarItem, type ToolbarItemDefinition } from "../../define-toolbar-item";
import { ToolbarItemDefinitionToken } from "../../tokens";

import { ToolbarItemsService } from "./toolbar-items-service";

import type { ToolbarItemInstance } from "./toolbar-config";
import type { BlockInstanceId, View, ViewId } from "../../config";

const ID_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ID_ABSENT = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const noop = () => null;

const dummy = defineToolbarItem<{ x: number }>({
  key: "dummy",
  label: () => "Dummy",
  schema: v.object({ x: v.number() }),
  defaultConfig: () => ({ x: 0 }),
  component: { setup: () => noop },
}) as ToolbarItemDefinition;

function build(items: readonly ToolbarItemDefinition[] = [dummy]): ToolbarItemsService {
  const c = new Container();
  c.addModule(createLoggerTestingModule().module);
  for (const item of items) c.register(ToolbarItemDefinitionToken).useValue(item);
  c.register(ToolbarItemsService).useClass(ToolbarItemsService);
  return c.resolve(ToolbarItemsService);
}

function viewWith(items: ToolbarItemInstance[]): View {
  return {
    id: "11111111-1111-1111-1111-111111111111" as ViewId,
    name: "V",
    icon: "x",
    defaultShelf: null,
    showInRibbon: false,
    leaf: "right",
    openOnStartup: false,
    rememberDate: false,
    followActiveDate: true,
    blocks: [{ id: "b1" as BlockInstanceId, key: "toolbar", config: { items } }],
  };
}

const item = (id: string, key = "dummy"): ToolbarItemInstance => ({
  id: id as BlockInstanceId,
  key,
  config: { x: 0 },
});

describe("ToolbarItemsService", () => {
  describe("itemsOf", () => {
    it("returns the parsed items of a toolbar block", () => {
      const service = build();
      const view = viewWith([item(ID_A)]);
      expect(service.itemsOf(view.blocks[0]).map((i) => i.id)).toEqual([ID_A]);
    });

    it("returns an empty list when the config has no items array", () => {
      const service = build();
      const block = { id: "b1" as BlockInstanceId, key: "toolbar", config: { items: "garbage" } };
      expect(service.itemsOf(block)).toEqual([]);
    });
  });

  describe("resolveItems", () => {
    it("resolves registered items to their definition and parsed config", () => {
      const service = build();
      const resolved = service.resolveItems([item(ID_A)]);
      expect(resolved.map((r) => r.id)).toEqual([ID_A]);
      expect(resolved[0].definition.key).toBe("dummy");
      expect(resolved[0].config).toEqual({ x: 0 });
    });

    it("skips an item whose key is not registered", () => {
      const service = build();
      expect(service.resolveItems([item(ID_A, "nope")])).toEqual([]);
    });

    it("skips an item whose config fails the item schema", () => {
      const service = build();
      const bad = { id: ID_A as BlockInstanceId, key: "dummy", config: { x: "no" } };
      expect(service.resolveItems([bad])).toEqual([]);
    });
  });

  describe("addItem", () => {
    it("returns UnknownToolbarItemKeyError for an unregistered key", () => {
      const service = build([]);
      const result = service.addItem(viewWith([]), "b1" as BlockInstanceId, "nope");
      expectErr(result);
      expect(result.error.kind).toBe("unknown-toolbar-item-key");
    });

    it("appends an item carrying the definition's defaultConfig", () => {
      const service = build();
      const result = service.addItem(viewWith([]), "b1" as BlockInstanceId, "dummy");
      expectOk(result);
      const items = service.itemsOf(result.value!.blocks[0]);
      expect(items).toHaveLength(1);
      expect(items[0].config).toEqual({ x: 0 });
    });

    it("uses the supplied config override", () => {
      const service = build();
      const result = service.addItem(viewWith([]), "b1" as BlockInstanceId, "dummy", { x: 99 });
      expectOk(result);
      expect(service.itemsOf(result.value!.blocks[0])[0].config).toEqual({ x: 99 });
    });

    it("returns Ok(null) when the block id is absent", () => {
      const service = build();
      const result = service.addItem(viewWith([]), "missing" as BlockInstanceId, "dummy");
      expectOk(result);
      expect(result.value).toBeNull();
    });
  });

  describe("removeItem", () => {
    it("drops the matching item", () => {
      const service = build();
      const blocks = service.removeItem(
        viewWith([item(ID_A), item(ID_B)]),
        "b1" as BlockInstanceId,
        ID_A as BlockInstanceId,
      );
      expect(blocks).not.toBeNull();
      expect(service.itemsOf(blocks![0]).map((i) => i.id)).toEqual([ID_B]);
    });

    it("returns null when the item id is absent", () => {
      const service = build();
      const blocks = service.removeItem(viewWith([item(ID_A)]), "b1" as BlockInstanceId, ID_ABSENT as BlockInstanceId);
      expect(blocks).toBeNull();
    });
  });

  describe("reorder", () => {
    it("reorders items to the given permutation", () => {
      const service = build();
      const blocks = service.reorder(viewWith([item(ID_A), item(ID_B)]), "b1" as BlockInstanceId, [
        ID_B as BlockInstanceId,
        ID_A as BlockInstanceId,
      ]);
      expect(blocks).not.toBeNull();
      expect(service.itemsOf(blocks![0]).map((i) => i.id)).toEqual([ID_B, ID_A]);
    });

    it("returns null when the ids are not a permutation", () => {
      const service = build();
      const blocks = service.reorder(viewWith([item(ID_A), item(ID_B)]), "b1" as BlockInstanceId, [
        ID_A as BlockInstanceId,
      ]);
      expect(blocks).toBeNull();
    });

    it("returns null when an id is repeated", () => {
      const service = build();
      const blocks = service.reorder(viewWith([item(ID_A), item(ID_B)]), "b1" as BlockInstanceId, [
        ID_A as BlockInstanceId,
        ID_A as BlockInstanceId,
      ]);
      expect(blocks).toBeNull();
    });

    it("returns null when an id is foreign to the block", () => {
      const service = build();
      const blocks = service.reorder(viewWith([item(ID_A), item(ID_B)]), "b1" as BlockInstanceId, [
        ID_A as BlockInstanceId,
        ID_ABSENT as BlockInstanceId,
      ]);
      expect(blocks).toBeNull();
    });

    it("returns null when the block id is absent", () => {
      const service = build();
      const blocks = service.reorder(viewWith([item(ID_A)]), "missing" as BlockInstanceId, [ID_A as BlockInstanceId]);
      expect(blocks).toBeNull();
    });
  });

  describe("updateItemConfig", () => {
    it("writes the new config on success", () => {
      const service = build();
      const result = service.updateItemConfig(
        viewWith([item(ID_A)]),
        "b1" as BlockInstanceId,
        ID_A as BlockInstanceId,
        {
          x: 7,
        },
      );
      expectOk(result);
      expect(service.itemsOf(result.value![0])[0].config).toEqual({ x: 7 });
    });

    it("returns InvalidToolbarItemConfigError when config fails the item schema", () => {
      const service = build();
      const result = service.updateItemConfig(
        viewWith([item(ID_A)]),
        "b1" as BlockInstanceId,
        ID_A as BlockInstanceId,
        {
          x: "no",
        },
      );
      expectErr(result);
      expect(result.error.kind).toBe("invalid-toolbar-item-config");
    });

    it("returns Ok(null) when the item id is absent", () => {
      const service = build();
      const result = service.updateItemConfig(
        viewWith([item(ID_A)]),
        "b1" as BlockInstanceId,
        ID_ABSENT as BlockInstanceId,
        {
          x: 1,
        },
      );
      expectOk(result);
      expect(result.value).toBeNull();
    });
  });
});
