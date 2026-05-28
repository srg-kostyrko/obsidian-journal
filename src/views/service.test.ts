import { createNanoEvents } from "nanoevents";
import * as v from "valibot";
import { describe, expect, it, vi } from "vitest";

import { Container } from "@/infrastructure/di";
import { expectErr, expectOk } from "@/infrastructure/result/testing";

import { defineViewBlock, type ViewBlockDefinition } from "./define-view-block";
import { ViewsRepository } from "./repository";
import { ViewsService } from "./service";
import { ViewBlockDefinitionToken, ViewsEventsToken, type ViewsEvents } from "./tokens";

import type { View, ViewId } from "./config";

const noop = () => null;

const trivialBlock = defineViewBlock<unknown>({
  key: "test-block",
  label: "Test Block",
  schema: v.object({ x: v.number() }),
  defaultConfig: {},
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

    it("returns Ok with a fresh view id", async () => {
      const { service, repo } = build();
      const created = await service.create({ name: "Source" });
      expectOk(created);
      const result = await service.clone(created.value);
      expectOk(result);
      expect(result.value).not.toBe(created.value);
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
});
