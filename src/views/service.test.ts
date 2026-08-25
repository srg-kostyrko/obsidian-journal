import * as v from "valibot";
import { describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

import type { Module } from "@/infrastructure/di";
import { expectErr, expectOk } from "@/infrastructure/result/testing";
import { journalsCoreModule } from "@/journals/module";
import { ShelvesRepository } from "@/shelves";
import { shelvesCoreModule } from "@/shelves/module";
import { buildShelf } from "@/shelves/testing";
import { testContainer, type TestHarness } from "@/testing";

import { viewsCoreModule } from "./module";
import { ViewsRepository } from "./repository";
import { ViewsService } from "./service";
import { buildToolbarItemDefinition, buildView, buildViewBlockDefinition } from "./testing";
import { ToolbarItemDefinitionToken, ViewBlockDefinitionToken, ViewsEventsToken } from "./tokens";

import type { BlockInstanceId, View, ViewId } from "./config";
import type { ToolbarItemDefinition } from "./define-toolbar-item";
import type { ViewBlockDefinition } from "./define-view-block";

const SCOPED_VIEW_ID = "33333333-3333-4333-8333-333333333333";

function testBlockModule(overrides: Partial<ViewBlockDefinition> = {}): Module {
  return {
    register(c) {
      c.register(ViewBlockDefinitionToken).useValue(
        buildViewBlockDefinition("test-block", {
          schema: v.object({ x: v.number() }),
          defaultConfig: { x: 0 },
          ...overrides,
        }),
      );
    },
  };
}

function testItemModule(overrides: Partial<ToolbarItemDefinition> = {}): Module {
  return {
    register(c) {
      c.register(ToolbarItemDefinitionToken).useValue(
        buildToolbarItemDefinition("dummy", {
          schema: v.object({ x: v.number() }),
          defaultConfig: () => ({ x: 0 }),
          ...overrides,
        }),
      );
    },
  };
}

async function build(
  options: {
    seeds?: Record<string, View>;
    blocks?: readonly Module[];
    items?: readonly Module[];
  } = {},
) {
  const harness = await testContainer({
    modules: [
      journalsCoreModule,
      shelvesCoreModule,
      viewsCoreModule,
      ...(options.blocks ?? []),
      ...(options.items ?? []),
    ],
    data: { views: options.seeds ?? {} },
  });
  return {
    harness,
    service: harness.resolve(ViewsService),
    repo: harness.resolve(ViewsRepository),
    events: harness.resolve(ViewsEventsToken),
  };
}

async function buildScopedToShelf(
  shelf: string,
): Promise<{ harness: TestHarness; repo: ViewsRepository; shelves: ShelvesRepository }> {
  const harness = await testContainer({
    modules: [journalsCoreModule, shelvesCoreModule, viewsCoreModule],
    data: {
      views: { [SCOPED_VIEW_ID]: buildView(SCOPED_VIEW_ID, { defaultShelf: shelf }) },
      shelves: { work: buildShelf("work") },
    },
  });
  return { harness, repo: harness.resolve(ViewsRepository), shelves: harness.resolve(ShelvesRepository) };
}

describe("ViewsService", () => {
  describe("shelf reference maintenance", () => {
    it("follows a renamed shelf so the view stays scoped to it", async () => {
      const { repo, shelves } = await buildScopedToShelf("work");
      shelves.rename("work", "office");
      expect(repo.get(SCOPED_VIEW_ID as ViewId).match({ some: (v) => v.defaultShelf, none: () => "gone" })).toBe(
        "office",
      );
    });

    it("leaves a view scoped to a different shelf untouched on rename", async () => {
      const { repo, shelves } = await buildScopedToShelf("personal");
      shelves.rename("work", "office");
      expect(repo.get(SCOPED_VIEW_ID as ViewId).match({ some: (v) => v.defaultShelf, none: () => "gone" })).toBe(
        "personal",
      );
    });

    it("unscopes a view whose shelf was deleted", async () => {
      const { repo, shelves } = await buildScopedToShelf("work");
      shelves.deleteWith("work");
      expect(repo.get(SCOPED_VIEW_ID as ViewId).match({ some: (v) => v.defaultShelf, none: () => "gone" })).toBeNull();
    });

    it("leaves a view scoped to a different shelf untouched on delete", async () => {
      const { repo, shelves } = await buildScopedToShelf("personal");
      shelves.deleteWith("work");
      expect(repo.get(SCOPED_VIEW_ID as ViewId).match({ some: (v) => v.defaultShelf, none: () => "gone" })).toBe(
        "personal",
      );
    });
  });

  describe("create", () => {
    it("returns Ok with the new view id", async () => {
      const { service } = await build();
      const result = await service.create({ name: "Calendar" });
      expectOk(result);
      expect(typeof result.value).toBe("string");
    });

    it("persists the new view through the repository", async () => {
      const { service, repo } = await build();
      const result = await service.create({ name: "Calendar" });
      expectOk(result);
      expect(repo.get(result.value).match({ some: (v) => v, none: () => null })).not.toBeNull();
    });

    it("emits created with the new view id (via BaseRepository.addEntity)", async () => {
      const { service, events } = await build();
      const listener = vi.fn();
      events.on("created", listener);
      const result = await service.create({ name: "Calendar" });
      expectOk(result);
      expect(listener).toHaveBeenCalledWith(result.value);
    });

    it("rejects an empty name", async () => {
      const { service } = await build();
      const result = await service.create({ name: "" });
      expectErr(result);
      expect(result.error.kind).toBe("invalid-view-name");
    });

    it("stores a blank icon when none is provided so the view falls back to a generic icon", async () => {
      const { service, repo } = await build();
      const result = await service.create({ name: "Calendar" });
      expectOk(result);
      expect(repo.get(result.value).match({ some: (v) => v.icon, none: () => null })).toBe("");
    });
  });

  describe("clone", () => {
    it("returns UnknownViewError when source view does not exist", async () => {
      const { service } = await build();
      const result = await service.clone("missing" as ViewId);
      expectErr(result);
      expect(result.error.kind).toBe("unknown-view");
    });

    it("generates a different id from the source", async () => {
      const { service } = await build();
      const created = await service.create({ name: "Source" });
      expectOk(created);
      const result = await service.clone(created.value);
      expectOk(result);
      expect(result.value).not.toBe(created.value);
    });

    it("persists the cloned view through the repository", async () => {
      const { service, repo } = await build();
      const created = await service.create({ name: "Source" });
      expectOk(created);
      const result = await service.clone(created.value);
      expectOk(result);
      expect(repo.get(result.value).match({ some: (v) => v, none: () => null })).not.toBeNull();
    });

    it("emits created on successful clone", async () => {
      const { service, events } = await build();
      const created = await service.create({ name: "Source" });
      expectOk(created);
      const listener = vi.fn();
      events.on("created", listener);
      const result = await service.clone(created.value);
      expectOk(result);
      expect(listener).toHaveBeenCalledWith(result.value);
    });

    it("clones block config that holds a reactive proxy nested at depth", async () => {
      const { service, repo } = await build({ blocks: [testBlockModule()] });
      const created = await service.create({ name: "Source" });
      expectOk(created);
      const added = await service.addBlock(created.value, "test-block");
      expectOk(added);
      // A config editor spreads the store's reactive config, so a sibling array/object read back
      // out of it stays a reactive proxy embedded at depth. structuredClone rejects proxies and a
      // shallow toRaw only unwraps the top level, so this is the shape that actually breaks cloning.
      // Written through updateBlockConfig (rather than seeded via `data:`) so the reactive nesting
      // comes from a live SettingsService store, the same way a config editor would produce it.
      await service.updateBlockConfig(created.value, added.value, { x: 0, nested: reactive({ count: 1 }) });

      const result = await service.clone(created.value);

      expectOk(result);
      const cloned = repo.get(result.value).match({ some: (view) => view, none: () => null });
      expect(cloned?.blocks[0]?.config).toEqual({ x: 0, nested: { count: 1 } });
    });
  });

  describe("update", () => {
    it("returns UnknownViewError for missing view", async () => {
      const { service } = await build();
      const result = await service.update("missing" as ViewId, { name: "X" });
      expectErr(result);
      expect(result.error.kind).toBe("unknown-view");
    });

    it("applies a partial patch", async () => {
      const { service, repo } = await build();
      const created = await service.create({ name: "Old" });
      expectOk(created);
      const result = await service.update(created.value, { name: "New" });
      expectOk(result);
      expect(repo.get(created.value).match({ some: (v) => v.name, none: () => null })).toBe("New");
    });

    it("emits updated with the view id and the patch", async () => {
      const { service, events } = await build();
      const created = await service.create({ name: "Old" });
      expectOk(created);
      const listener = vi.fn();
      events.on("updated", listener);
      const result = await service.update(created.value, { name: "New" });
      expectOk(result);
      expect(listener).toHaveBeenCalledWith(created.value, expect.objectContaining({ name: "New" }));
    });

    it("rejects an empty name in the patch", async () => {
      const { service } = await build();
      const created = await service.create({ name: "Old" });
      expectOk(created);
      const result = await service.update(created.value, { name: "" });
      expectErr(result);
      expect(result.error.kind).toBe("invalid-view-name");
    });

    it("persists openOnStartup through a patch", async () => {
      const { service, repo } = await build();
      const created = await service.create({ name: "V" });
      expectOk(created);
      const result = await service.update(created.value, { openOnStartup: true });
      expectOk(result);
      expect(repo.get(created.value).match({ some: (v) => v.openOnStartup, none: () => null })).toBe(true);
    });
  });

  describe("delete", () => {
    it("removes the view from the repository", async () => {
      const { service, repo } = await build();
      const created = await service.create({ name: "X" });
      expectOk(created);
      await service.delete(created.value);
      expect(repo.get(created.value).match({ some: () => true, none: () => false })).toBe(false);
    });

    it("returns UnknownViewError when called twice", async () => {
      const { service } = await build();
      const created = await service.create({ name: "X" });
      expectOk(created);
      const first = await service.delete(created.value);
      expectOk(first);
      const second = await service.delete(created.value);
      expectErr(second);
      expect(second.error.kind).toBe("unknown-view");
    });

    it("emits deleted with the view id", async () => {
      const { service, events } = await build();
      const created = await service.create({ name: "X" });
      expectOk(created);
      const listener = vi.fn();
      events.on("deleted", listener);
      const result = await service.delete(created.value);
      expectOk(result);
      expect(listener).toHaveBeenCalledWith(created.value);
    });
  });

  describe("getBlockDefinition", () => {
    it("returns None for an unknown key", async () => {
      const { service } = await build();
      const result = service.getBlockDefinition("nope");
      expect(result.isNone()).toBe(true);
    });

    it("returns Some for a registered block", async () => {
      const { service } = await build();
      const result = service.getBlockDefinition("divider");
      expect(result.isNone()).toBe(false);
    });
  });

  describe("addBlock", () => {
    it("returns UnknownViewError for missing view", async () => {
      const { service } = await build();
      const result = await service.addBlock("missing" as ViewId, "test-block");
      expectErr(result);
      expect(result.error.kind).toBe("unknown-view");
    });

    it("returns UnknownViewBlockKeyError for an unknown block key", async () => {
      const { service } = await build();
      const created = await service.create({ name: "X" });
      expectOk(created);
      const result = await service.addBlock(created.value, "nope");
      expectErr(result);
      expect(result.error.kind).toBe("unknown-view-block-key");
    });

    it("generates a fresh BlockInstanceId per call", async () => {
      const { service } = await build({ blocks: [testBlockModule()] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const first = await service.addBlock(created.value, "test-block");
      const second = await service.addBlock(created.value, "test-block");
      expectOk(first);
      expectOk(second);
      expect(first.value).not.toBe(second.value);
    });

    it("appends to the view's blocks list with the block's defaultConfig", async () => {
      const { service, repo } = await build({ blocks: [testBlockModule()] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const added = await service.addBlock(created.value, "test-block");
      expectOk(added);
      const view = repo.get(created.value).match({ some: (v) => v, none: () => null });
      expect(view?.blocks).toHaveLength(1);
      expect(view?.blocks[0]?.config).toEqual({ x: 0 });
    });

    it("isolates each added block's config from the shared definition default", async () => {
      const { service, repo } = await build({ blocks: [testBlockModule()] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const first = await service.addBlock(created.value, "test-block");
      expectOk(first);
      const stored = repo.get(created.value).match({ some: (v) => v.blocks[0]?.config, none: () => undefined });
      (stored as { x: number }).x = 42;

      const second = await service.addBlock(created.value, "test-block");
      expectOk(second);
      const view = repo.get(created.value).match({ some: (v) => v, none: () => null });
      expect(view?.blocks[1]?.config).toEqual({ x: 0 });
    });

    it("emits updated with the view id and the new blocks list", async () => {
      const { service, events } = await build({ blocks: [testBlockModule()] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const listener = vi.fn();
      events.on("updated", listener);
      const added = await service.addBlock(created.value, "test-block");
      expectOk(added);
      expect(listener).toHaveBeenCalledOnce();
      const [calledId, calledView] = listener.mock.calls[0] as [unknown, { blocks: unknown[] }];
      expect(calledId).toBe(created.value);
      expect(Array.isArray(calledView.blocks)).toBe(true);
    });
  });

  describe("removeBlock", () => {
    it("removes the matching instance", async () => {
      const { service, repo } = await build({ blocks: [testBlockModule()] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const added = await service.addBlock(created.value, "test-block");
      expectOk(added);
      await service.removeBlock(created.value, added.value);
      expect(repo.get(created.value).match({ some: (v) => v.blocks, none: () => null })).toEqual([]);
    });

    it("does not emit updated when block id is not present", async () => {
      const { service, events } = await build({ blocks: [testBlockModule()] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const listener = vi.fn();
      events.on("updated", listener);
      await service.removeBlock(created.value, "missing-id" as BlockInstanceId);
      expect(listener).not.toHaveBeenCalled();
    });

    it("leaves the blocks list unchanged when block id is not present", async () => {
      const { service, repo } = await build({ blocks: [testBlockModule()] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      await service.removeBlock(created.value, "missing-id" as BlockInstanceId);
      expect(repo.get(created.value).match({ some: (v) => v.blocks, none: () => null })).toEqual([]);
    });
  });

  describe("setBlockOrder", () => {
    it("reorders blocks to the given permutation", async () => {
      const { service, repo } = await build({ blocks: [testBlockModule()] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const a = await service.addBlock(created.value, "test-block");
      const b = await service.addBlock(created.value, "test-block");
      expectOk(a);
      expectOk(b);
      await service.setBlockOrder(created.value, [b.value, a.value]);
      const ids = repo.get(created.value).match({ some: (v) => v.blocks.map((x) => x.id), none: () => [] });
      expect(ids).toEqual([b.value, a.value]);
    });

    it("is an Ok no-op when the ids are not a permutation of the blocks", async () => {
      const { service, repo } = await build({ blocks: [testBlockModule()] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const a = await service.addBlock(created.value, "test-block");
      const b = await service.addBlock(created.value, "test-block");
      expectOk(a);
      expectOk(b);
      const result = await service.setBlockOrder(created.value, [a.value]);
      expectOk(result);
      const ids = repo.get(created.value).match({ some: (v) => v.blocks.map((x) => x.id), none: () => [] });
      expect(ids).toEqual([a.value, b.value]);
    });

    it("is an Ok no-op when an id is foreign to the view", async () => {
      const { service, repo } = await build({ blocks: [testBlockModule()] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const a = await service.addBlock(created.value, "test-block");
      const b = await service.addBlock(created.value, "test-block");
      expectOk(a);
      expectOk(b);
      const result = await service.setBlockOrder(created.value, [
        a.value,
        "cccccccc-cccc-cccc-cccc-cccccccccccc" as BlockInstanceId,
      ]);
      expectOk(result);
      const ids = repo.get(created.value).match({ some: (v) => v.blocks.map((x) => x.id), none: () => [] });
      expect(ids).toEqual([a.value, b.value]);
    });

    it("is an Ok no-op when an id is repeated", async () => {
      const { service, repo } = await build({ blocks: [testBlockModule()] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const a = await service.addBlock(created.value, "test-block");
      const b = await service.addBlock(created.value, "test-block");
      expectOk(a);
      expectOk(b);
      const result = await service.setBlockOrder(created.value, [a.value, a.value]);
      expectOk(result);
      const ids = repo.get(created.value).match({ some: (v) => v.blocks.map((x) => x.id), none: () => [] });
      expect(ids).toEqual([a.value, b.value]);
    });

    it("returns UnknownViewError for an unknown view", async () => {
      const { service } = await build({ blocks: [testBlockModule()] });
      const result = await service.setBlockOrder("nope" as ViewId, []);
      expectErr(result);
      expect(result.error.kind).toBe("unknown-view");
    });
  });

  describe("updateBlockConfig", () => {
    it("returns InvalidViewBlockConfigError when config fails block schema", async () => {
      const { service } = await build({ blocks: [testBlockModule()] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const added = await service.addBlock(created.value, "test-block");
      expectOk(added);
      const result = await service.updateBlockConfig(created.value, added.value, { x: "not a number" });
      expectErr(result);
      expect(result.error.kind).toBe("invalid-view-block-config");
    });

    it("persists the new config on success", async () => {
      const { service, repo } = await build({ blocks: [testBlockModule()] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const added = await service.addBlock(created.value, "test-block");
      expectOk(added);
      await service.updateBlockConfig(created.value, added.value, { x: 42 });
      const config = repo.get(created.value).match({ some: (v) => v.blocks[0]?.config, none: () => null });
      expect(config).toEqual({ x: 42 });
    });
  });
});

// ─── Toolbar-item operations ──────────────────────────────────────────────────
// The "toolbar" view block is one of the six real blocks viewsCoreModule registers, so these
// tests use it directly rather than a synthetic — only the toolbar-item key ("dummy") needs a
// synthetic definition, for its schema/defaultConfig content.

describe("ViewsService – toolbar-item operations", () => {
  describe("addToolbarItem", () => {
    it("appends a new item to the toolbar block's items array", async () => {
      const { service, repo } = await build({ items: [testItemModule()] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const blockAdded = await service.addBlock(created.value, "toolbar");
      expectOk(blockAdded);

      const itemAdded = await service.addToolbarItem(created.value, blockAdded.value, "dummy");
      expectOk(itemAdded);

      const items = repo
        .get(created.value)
        .match({ some: (v) => (v.blocks[0]?.config as { items: unknown[] }).items, none: () => null });
      expect(items).toHaveLength(1);
    });

    it("isolates each added item's config from the shared definition default", async () => {
      const { service, repo } = await build({ items: [testItemModule()] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const blockAdded = await service.addBlock(created.value, "toolbar");
      expectOk(blockAdded);
      const storedItems = (): { config: { x: number } }[] =>
        repo.get(created.value).match({
          some: (view) => (view.blocks[0]?.config as { items: { config: { x: number } }[] }).items,
          none: () => [],
        });

      expectOk(await service.addToolbarItem(created.value, blockAdded.value, "dummy"));
      const first = storedItems()[0];
      if (first) first.config.x = 42;

      expectOk(await service.addToolbarItem(created.value, blockAdded.value, "dummy"));
      expect(storedItems()[1]?.config).toEqual({ x: 0 });
    });

    it("returns UnknownToolbarItemKeyError when the key is not registered", async () => {
      const { service } = await build();
      const created = await service.create({ name: "X" });
      expectOk(created);
      const blockAdded = await service.addBlock(created.value, "toolbar");
      expectOk(blockAdded);

      const result = await service.addToolbarItem(created.value, blockAdded.value, "nope");
      expectErr(result);
      expect(result.error.kind).toBe("unknown-toolbar-item-key");
    });
  });

  describe("removeToolbarItem", () => {
    it("removes the matching item", async () => {
      const { service, repo } = await build({ items: [testItemModule()] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const blockAdded = await service.addBlock(created.value, "toolbar");
      expectOk(blockAdded);
      const itemAdded = await service.addToolbarItem(created.value, blockAdded.value, "dummy");
      expectOk(itemAdded);

      const result = await service.removeToolbarItem(created.value, blockAdded.value, itemAdded.value!);
      expectOk(result);

      const items = repo
        .get(created.value)
        .match({ some: (v) => (v.blocks[0]?.config as { items: unknown[] }).items, none: () => null });
      expect(items).toHaveLength(0);
    });
  });

  describe("setToolbarItemOrder", () => {
    it("reorders the toolbar items to the given permutation", async () => {
      const { service, repo } = await build({ items: [testItemModule()] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const block = await service.addBlock(created.value, "toolbar");
      expectOk(block);
      const a = await service.addToolbarItem(created.value, block.value, "dummy");
      const b = await service.addToolbarItem(created.value, block.value, "dummy");
      expectOk(a);
      expectOk(b);
      await service.setToolbarItemOrder(created.value, block.value, [b.value!, a.value!]);
      const ids = repo.get(created.value).match({
        some: (v) => ((v.blocks[0]?.config as { items: { id: string }[] }).items ?? []).map((i) => i.id),
        none: () => [],
      });
      expect(ids).toEqual([b.value, a.value]);
    });

    it("is an Ok no-op when the ids are not a permutation", async () => {
      const { service, repo } = await build({ items: [testItemModule()] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const block = await service.addBlock(created.value, "toolbar");
      expectOk(block);
      const a = await service.addToolbarItem(created.value, block.value, "dummy");
      const b = await service.addToolbarItem(created.value, block.value, "dummy");
      expectOk(a);
      expectOk(b);
      const result = await service.setToolbarItemOrder(created.value, block.value, [a.value!]);
      expectOk(result);
      const ids = repo.get(created.value).match({
        some: (v) => ((v.blocks[0]?.config as { items: { id: string }[] }).items ?? []).map((i) => i.id),
        none: () => [],
      });
      expect(ids).toEqual([a.value, b.value]);
    });

    it("returns UnknownViewError for an unknown view", async () => {
      const { service } = await build();
      const result = await service.setToolbarItemOrder("nope" as ViewId, "b" as BlockInstanceId, []);
      expectErr(result);
      expect(result.error.kind).toBe("unknown-view");
    });
  });

  describe("updateToolbarItemConfig", () => {
    it("persists a valid config", async () => {
      const { service, repo } = await build({ items: [testItemModule()] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const blockAdded = await service.addBlock(created.value, "toolbar");
      expectOk(blockAdded);
      const itemAdded = await service.addToolbarItem(created.value, blockAdded.value, "dummy");
      expectOk(itemAdded);

      const result = await service.updateToolbarItemConfig(created.value, blockAdded.value, itemAdded.value!, {
        x: 42,
      });
      expectOk(result);

      const config = repo.get(created.value).match({
        some: (v) => (v.blocks[0]?.config as { items: { config: unknown }[] }).items[0]?.config,
        none: () => null,
      });
      expect(config).toEqual({ x: 42 });
    });

    it("returns InvalidToolbarItemConfigError when the new config fails schema validation", async () => {
      const { service } = await build({ items: [testItemModule()] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const blockAdded = await service.addBlock(created.value, "toolbar");
      expectOk(blockAdded);
      const itemAdded = await service.addToolbarItem(created.value, blockAdded.value, "dummy");
      expectOk(itemAdded);

      const result = await service.updateToolbarItemConfig(created.value, blockAdded.value, itemAdded.value!, {
        x: "not-a-number",
      });
      expectErr(result);
      expect(result.error.kind).toBe("invalid-toolbar-item-config");
    });

    it("persists without validation and logs when the toolbar-item key is unregistered", async () => {
      const { service, repo } = await build({ items: [testItemModule()] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const blockAdded = await service.addBlock(created.value, "toolbar");
      expectOk(blockAdded);
      const itemAdded = await service.addToolbarItem(created.value, blockAdded.value, "dummy");
      expectOk(itemAdded);

      // Manually mutate repo to change the item's key to something unregistered
      const view = repo.get(created.value).match({ some: (v) => v, none: () => null })!;
      const blocks = view.blocks.map((b) => ({
        ...b,
        config: {
          ...b.config,
          items: (b.config as { items: { id: string; key: string; config: Record<string, unknown> }[] }).items.map(
            (i) => (i.id === itemAdded.value ? { ...i, key: "unregistered-key" } : i),
          ),
        },
      }));
      repo.update(created.value, { blocks });

      const result = await service.updateToolbarItemConfig(created.value, blockAdded.value, itemAdded.value!, {
        anything: true,
      });
      expectOk(result);

      const config = repo.get(created.value).match({
        some: (v) => (v.blocks[0]?.config as { items: { config: unknown }[] }).items[0]?.config,
        none: () => null,
      });
      expect(config).toEqual({ anything: true });
    });
  });

  describe("getToolbarItemDefinition", () => {
    it("returns Some with the registered definition for a known key", async () => {
      const { service } = await build();
      const definition = service.getToolbarItemDefinition("spacer");
      expect(definition.match({ some: (d) => d.key, none: () => null })).toBe("spacer");
    });

    it("returns None for an unknown key", async () => {
      const { service } = await build();
      const definition = service.getToolbarItemDefinition("nope");
      expect(definition.isNone()).toBe(true);
    });
  });
});
