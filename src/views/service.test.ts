import { createNanoEvents } from "nanoevents";
import * as v from "valibot";
import { describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";
import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { defineViewBlock, type ViewBlockDefinition } from "./define-view-block";
import { ViewsRepository } from "./repository";
import { ViewsService } from "./service";
import { ViewBlockDefinitionToken, ViewsEventsToken, type ViewsEvents } from "./tokens";

import type { BlockInstanceId, View, ViewId } from "./config";

const noop = () => null;

const trivialBlock = defineViewBlock<unknown>({
  key: "test-block",
  label: "Test Block",
  schema: v.object({ x: v.number() }),
  defaultConfig: { x: 0 },
  component: { setup: () => noop },
});

function build(
  options: {
    seeds?: Record<string, View>;
    blocks?: readonly ViewBlockDefinition[];
  } = {},
): { service: ViewsService; events: ReturnType<typeof createNanoEvents<ViewsEvents>>; repo: ViewsRepository } {
  const events = createNanoEvents<ViewsEvents>();
  const repo = ViewsRepository.fromParts(options.seeds ?? {}, events);
  const c = new Container();
  c.register(ViewsRepository).useValue(repo);
  c.register(ViewsEventsToken).useValue(events);
  for (const block of options.blocks ?? []) {
    c.register(ViewBlockDefinitionToken).useValue(block);
  }
  c.register(ViewsService).useClass(ViewsService);
  return { service: c.resolve(ViewsService), events, repo };
}

describe("ViewsService", () => {
  describe("create", () => {
    it("returns Ok with the new view id", async () => {
      const { service } = build();
      const result = await service.create({ name: "Calendar" });
      expectOk(result);
      expect(typeof result.value).toBe("string");
    });

    it("persists the new view through the repository", async () => {
      const { service, repo } = build();
      const result = await service.create({ name: "Calendar" });
      expectOk(result);
      expect(repo.get(result.value).match({ some: (v) => v, none: () => null })).not.toBeNull();
    });

    it("emits created with the new view id (via BaseRepository.addEntity)", async () => {
      const { service, events } = build();
      const listener = vi.fn();
      events.on("created", listener);
      const result = await service.create({ name: "Calendar" });
      expectOk(result);
      expect(listener).toHaveBeenCalledWith(result.value);
    });

    it("rejects an empty name", async () => {
      const { service } = build();
      const result = await service.create({ name: "" });
      expectErr(result);
      expect(result.error.kind).toBe("invalid-view-name");
    });
  });

  describe("clone", () => {
    it("returns UnknownViewError when source view does not exist", async () => {
      const { service } = build();
      const result = await service.clone("missing" as ViewId);
      expectErr(result);
      expect(result.error.kind).toBe("unknown-view");
    });

    it("generates a different id from the source", async () => {
      const { service } = build();
      const created = await service.create({ name: "Source" });
      expectOk(created);
      const result = await service.clone(created.value);
      expectOk(result);
      expect(result.value).not.toBe(created.value);
    });

    it("persists the cloned view through the repository", async () => {
      const { service, repo } = build();
      const created = await service.create({ name: "Source" });
      expectOk(created);
      const result = await service.clone(created.value);
      expectOk(result);
      expect(repo.get(result.value).match({ some: (v) => v, none: () => null })).not.toBeNull();
    });

    it("emits created on successful clone", async () => {
      const { service, events } = build();
      const created = await service.create({ name: "Source" });
      expectOk(created);
      const listener = vi.fn();
      events.on("created", listener);
      const result = await service.clone(created.value);
      expectOk(result);
      expect(listener).toHaveBeenCalledWith(result.value);
    });
  });

  describe("update", () => {
    it("returns UnknownViewError for missing view", async () => {
      const { service } = build();
      const result = await service.update("missing" as ViewId, { name: "X" });
      expectErr(result);
      expect(result.error.kind).toBe("unknown-view");
    });

    it("applies a partial patch", async () => {
      const { service, repo } = build();
      const created = await service.create({ name: "Old" });
      expectOk(created);
      const result = await service.update(created.value, { name: "New" });
      expectOk(result);
      expect(repo.get(created.value).match({ some: (v) => v.name, none: () => null })).toBe("New");
    });

    it("emits updated with the view id and the patch", async () => {
      const { service, events } = build();
      const created = await service.create({ name: "Old" });
      expectOk(created);
      const listener = vi.fn();
      events.on("updated", listener);
      const result = await service.update(created.value, { name: "New" });
      expectOk(result);
      expect(listener).toHaveBeenCalledWith(created.value, expect.objectContaining({ name: "New" }));
    });

    it("rejects an empty name in the patch", async () => {
      const { service } = build();
      const created = await service.create({ name: "Old" });
      expectOk(created);
      const result = await service.update(created.value, { name: "" });
      expectErr(result);
      expect(result.error.kind).toBe("invalid-view-name");
    });
  });

  describe("delete", () => {
    it("removes the view from the repository", async () => {
      const { service, repo } = build();
      const created = await service.create({ name: "X" });
      expectOk(created);
      await service.delete(created.value);
      expect(repo.get(created.value).match({ some: () => true, none: () => false })).toBe(false);
    });

    it("returns UnknownViewError when called twice", async () => {
      const { service } = build();
      const created = await service.create({ name: "X" });
      expectOk(created);
      const first = await service.delete(created.value);
      expectOk(first);
      const second = await service.delete(created.value);
      expectErr(second);
      expect(second.error.kind).toBe("unknown-view");
    });

    it("emits deleted with the view id", async () => {
      const { service, events } = build();
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
    it("returns None for an unknown key", () => {
      const { service } = build();
      const result = service.getBlockDefinition("nope");
      expect(result.isNone()).toBe(true);
    });

    it("returns Some for a registered block", () => {
      const { service } = build({ blocks: [trivialBlock] });
      const result = service.getBlockDefinition("test-block");
      expect(result.isNone()).toBe(false);
    });
  });

  describe("addBlock", () => {
    it("returns UnknownViewError for missing view", async () => {
      const { service } = build({ blocks: [trivialBlock] });
      const result = await service.addBlock("missing" as ViewId, "test-block");
      expectErr(result);
      expect(result.error.kind).toBe("unknown-view");
    });

    it("returns UnknownViewBlockKeyError for an unknown block key", async () => {
      const { service } = build();
      const created = await service.create({ name: "X" });
      expectOk(created);
      const result = await service.addBlock(created.value, "nope");
      expectErr(result);
      expect(result.error.kind).toBe("unknown-view-block-key");
    });

    it("returns Ok with a fresh BlockInstanceId on success", async () => {
      const { service } = build({ blocks: [trivialBlock] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const result = await service.addBlock(created.value, "test-block");
      expectOk(result);
      expect(typeof result.value).toBe("string");
    });

    it("appends to the view's blocks list with the block's defaultConfig", async () => {
      const { service, repo } = build({ blocks: [trivialBlock] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const added = await service.addBlock(created.value, "test-block");
      expectOk(added);
      const view = repo.get(created.value).match({ some: (v) => v, none: () => null });
      expect(view?.blocks).toHaveLength(1);
      expect(view?.blocks[0]?.config).toEqual({ x: 0 });
    });

    it("emits updated with the view id and the new blocks list", async () => {
      const { service, events } = build({ blocks: [trivialBlock] });
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
      const { service, repo } = build({ blocks: [trivialBlock] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const added = await service.addBlock(created.value, "test-block");
      expectOk(added);
      await service.removeBlock(created.value, added.value);
      expect(repo.get(created.value).match({ some: (v) => v.blocks, none: () => null })).toEqual([]);
    });

    it("is a no-op when block id is not present", async () => {
      const { service, repo } = build({ blocks: [trivialBlock] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      await service.removeBlock(created.value, "missing-id" as BlockInstanceId);
      expect(repo.get(created.value).match({ some: (v) => v.blocks, none: () => null })).toEqual([]);
    });
  });

  describe("moveBlockUp", () => {
    it("swaps with the previous block", async () => {
      const { service, repo } = build({ blocks: [trivialBlock] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const a = await service.addBlock(created.value, "test-block");
      const b = await service.addBlock(created.value, "test-block");
      expectOk(a);
      expectOk(b);
      await service.moveBlockUp(created.value, b.value);
      const ids = repo.get(created.value).match({ some: (v) => v.blocks.map((x) => x.id), none: () => [] });
      expect(ids).toEqual([b.value, a.value]);
    });

    it("is an Ok no-op at index 0", async () => {
      const { service, repo } = build({ blocks: [trivialBlock] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const a = await service.addBlock(created.value, "test-block");
      expectOk(a);
      const result = await service.moveBlockUp(created.value, a.value);
      expectOk(result);
      const firstId = repo.get(created.value).match({ some: (v) => v.blocks[0]?.id, none: () => null });
      expect(firstId).toBe(a.value);
    });
  });

  describe("moveBlockDown", () => {
    it("swaps with the next block", async () => {
      const { service, repo } = build({ blocks: [trivialBlock] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const a = await service.addBlock(created.value, "test-block");
      const b = await service.addBlock(created.value, "test-block");
      expectOk(a);
      expectOk(b);
      await service.moveBlockDown(created.value, a.value);
      const ids = repo.get(created.value).match({ some: (v) => v.blocks.map((x) => x.id), none: () => [] });
      expect(ids).toEqual([b.value, a.value]);
    });

    it("is an Ok no-op at the last index", async () => {
      const { service, repo } = build({ blocks: [trivialBlock] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const a = await service.addBlock(created.value, "test-block");
      expectOk(a);
      const result = await service.moveBlockDown(created.value, a.value);
      expectOk(result);
      const firstId = repo.get(created.value).match({ some: (v) => v.blocks[0]?.id, none: () => null });
      expect(firstId).toBe(a.value);
    });
  });

  describe("updateBlockConfig", () => {
    it("returns InvalidViewBlockConfigError when config fails block schema", async () => {
      const { service } = build({ blocks: [trivialBlock] });
      const created = await service.create({ name: "X" });
      expectOk(created);
      const added = await service.addBlock(created.value, "test-block");
      expectOk(added);
      const result = await service.updateBlockConfig(created.value, added.value, { x: "not a number" });
      expectErr(result);
      expect(result.error.kind).toBe("invalid-view-block-config");
    });

    it("persists the new config on success", async () => {
      const { service, repo } = build({ blocks: [trivialBlock] });
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
