import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { Module } from "@/infrastructure/di";
import { expectErr, expectOk } from "@/infrastructure/result/testing";
import { journalsCoreModule } from "@/journals/module";
import { shelvesCoreModule } from "@/shelves/module";
import { testContainer, type TestHarness } from "@/testing";

import { viewsCoreModule } from "../../module";
import { buildToolbarItemDefinition, buildView } from "../../testing";
import { ToolbarItemDefinitionToken } from "../../tokens";

import { ToolbarItemsService } from "./toolbar-items-service";

import type { ToolbarItemInstance } from "./toolbar-config";
import type { BlockInstanceId, View } from "../../config";
import type { ToolbarItemDefinition } from "../../define-toolbar-item";

const ID_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ID_ABSENT = "cccccccc-cccc-cccc-cccc-cccccccccccc";

async function build(): Promise<ToolbarItemsService> {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, viewsCoreModule],
    data: { views: {} },
  });
  return harness.resolve(ToolbarItemsService);
}

function testItemsModule(overrides: Partial<ToolbarItemDefinition> = {}): Module {
  return {
    register(c) {
      c.register(ToolbarItemDefinitionToken).useValue(buildToolbarItemDefinition("test-item", overrides));
    },
  };
}

async function buildWithTestItem(overrides: Partial<ToolbarItemDefinition> = {}): Promise<ToolbarItemsService> {
  const harness: TestHarness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, viewsCoreModule, testItemsModule(overrides)],
    data: { views: {} },
  });
  return harness.resolve(ToolbarItemsService);
}

function viewWith(items: ToolbarItemInstance[]): View {
  return buildView("v1", { blocks: [{ id: "b1" as BlockInstanceId, key: "toolbar", config: { items } }] });
}

const item = (id: string, key = "spacer"): ToolbarItemInstance => ({
  id: id as BlockInstanceId,
  key,
  config: {},
});

describe("ToolbarItemsService", () => {
  describe("itemsOf", () => {
    it("returns the parsed items of a toolbar block", async () => {
      const service = await build();
      const view = viewWith([item(ID_A)]);
      expect(service.itemsOf(view.blocks[0]).map((i) => i.id)).toEqual([ID_A]);
    });

    it("returns an empty list when the config has no items array", async () => {
      const service = await build();
      const block = { id: "b1" as BlockInstanceId, key: "toolbar", config: { items: "garbage" } };
      expect(service.itemsOf(block)).toEqual([]);
    });
  });

  describe("resolveItems", () => {
    it("resolves registered items to their definition and parsed config", async () => {
      const service = await buildWithTestItem({ schema: v.object({ x: v.number() }), defaultConfig: () => ({ x: 0 }) });
      const resolved = service.resolveItems([{ id: ID_A as BlockInstanceId, key: "test-item", config: { x: 0 } }]);
      expect(resolved.map((r) => r.id)).toEqual([ID_A]);
      expect(resolved[0].definition.key).toBe("test-item");
      expect(resolved[0].config).toEqual({ x: 0 });
    });

    it("skips an item whose key is not registered", async () => {
      const service = await build();
      expect(service.resolveItems([item(ID_A, "nope")])).toEqual([]);
    });

    it("skips an item whose config fails the item schema", async () => {
      const service = await buildWithTestItem({ schema: v.object({ x: v.number() }), defaultConfig: () => ({ x: 0 }) });
      const bad = { id: ID_A as BlockInstanceId, key: "test-item", config: { x: "no" } };
      expect(service.resolveItems([bad])).toEqual([]);
    });
  });

  describe("addItem", () => {
    it("returns UnknownToolbarItemKeyError for an unregistered key", async () => {
      const service = await build();
      const result = service.addItem(viewWith([]), "b1" as BlockInstanceId, "nope");
      expectErr(result);
      expect(result.error.kind).toBe("unknown-toolbar-item-key");
    });

    it("appends an item carrying the definition's defaultConfig", async () => {
      const service = await buildWithTestItem({ defaultConfig: () => ({ x: 0 }) });
      const result = service.addItem(viewWith([]), "b1" as BlockInstanceId, "test-item");
      expectOk(result);
      const items = service.itemsOf(result.value!.blocks[0]);
      expect(items).toHaveLength(1);
      expect(items[0].config).toEqual({ x: 0 });
    });

    it("uses the supplied config override", async () => {
      const service = await buildWithTestItem({ defaultConfig: () => ({ x: 0 }) });
      const result = service.addItem(viewWith([]), "b1" as BlockInstanceId, "test-item", { x: 99 });
      expectOk(result);
      expect(service.itemsOf(result.value!.blocks[0])[0].config).toEqual({ x: 99 });
    });

    it("returns Ok(null) when the block id is absent", async () => {
      const service = await build();
      const result = service.addItem(viewWith([]), "missing" as BlockInstanceId, "spacer");
      expectOk(result);
      expect(result.value).toBeNull();
    });
  });

  describe("removeItem", () => {
    it("drops the matching item", async () => {
      const service = await build();
      const blocks = service.removeItem(
        viewWith([item(ID_A), item(ID_B)]),
        "b1" as BlockInstanceId,
        ID_A as BlockInstanceId,
      );
      expect(blocks).not.toBeNull();
      expect(service.itemsOf(blocks![0]).map((i) => i.id)).toEqual([ID_B]);
    });

    it("returns null when the item id is absent", async () => {
      const service = await build();
      const blocks = service.removeItem(viewWith([item(ID_A)]), "b1" as BlockInstanceId, ID_ABSENT as BlockInstanceId);
      expect(blocks).toBeNull();
    });
  });

  describe("reorder", () => {
    it("reorders items to the given permutation", async () => {
      const service = await build();
      const blocks = service.reorder(viewWith([item(ID_A), item(ID_B)]), "b1" as BlockInstanceId, [
        ID_B as BlockInstanceId,
        ID_A as BlockInstanceId,
      ]);
      expect(blocks).not.toBeNull();
      expect(service.itemsOf(blocks![0]).map((i) => i.id)).toEqual([ID_B, ID_A]);
    });

    it("returns null when the ids are not a permutation", async () => {
      const service = await build();
      const blocks = service.reorder(viewWith([item(ID_A), item(ID_B)]), "b1" as BlockInstanceId, [
        ID_A as BlockInstanceId,
      ]);
      expect(blocks).toBeNull();
    });

    it("returns null when an id is repeated", async () => {
      const service = await build();
      const blocks = service.reorder(viewWith([item(ID_A), item(ID_B)]), "b1" as BlockInstanceId, [
        ID_A as BlockInstanceId,
        ID_A as BlockInstanceId,
      ]);
      expect(blocks).toBeNull();
    });

    it("returns null when an id is foreign to the block", async () => {
      const service = await build();
      const blocks = service.reorder(viewWith([item(ID_A), item(ID_B)]), "b1" as BlockInstanceId, [
        ID_A as BlockInstanceId,
        ID_ABSENT as BlockInstanceId,
      ]);
      expect(blocks).toBeNull();
    });

    it("returns null when the block id is absent", async () => {
      const service = await build();
      const blocks = service.reorder(viewWith([item(ID_A)]), "missing" as BlockInstanceId, [ID_A as BlockInstanceId]);
      expect(blocks).toBeNull();
    });
  });

  describe("updateItemConfig", () => {
    it("writes the new config on success", async () => {
      const service = await buildWithTestItem({ schema: v.object({ x: v.number() }) });
      const result = service.updateItemConfig(
        viewWith([item(ID_A, "test-item")]),
        "b1" as BlockInstanceId,
        ID_A as BlockInstanceId,
        {
          x: 7,
        },
      );
      expectOk(result);
      expect(service.itemsOf(result.value![0])[0].config).toEqual({ x: 7 });
    });

    it("returns InvalidToolbarItemConfigError when config fails the item schema", async () => {
      const service = await buildWithTestItem({ schema: v.object({ x: v.number() }) });
      const result = service.updateItemConfig(
        viewWith([item(ID_A, "test-item")]),
        "b1" as BlockInstanceId,
        ID_A as BlockInstanceId,
        {
          x: "no",
        },
      );
      expectErr(result);
      expect(result.error.kind).toBe("invalid-toolbar-item-config");
    });

    it("returns Ok(null) when the item id is absent", async () => {
      const service = await build();
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
