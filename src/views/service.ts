import * as v from "valibot";

import { inject } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { attempt, Err, Option, type AsyncResult } from "@/infrastructure/result";

import {
  InvalidToolbarItemConfigError,
  InvalidViewBlockConfigError,
  InvalidViewNameError,
  UnknownToolbarItemKeyError,
  UnknownViewBlockKeyError,
  UnknownViewError,
  ViewsInvariantError,
  type ViewsLifecycleError,
} from "./errors";
import { ViewsRepository } from "./repository";
import { ToolbarItemDefinitionToken, ViewBlockDefinitionToken } from "./tokens";

import type { BlockInstanceId, View, ViewId } from "./config";
import type { ToolbarItemDefinition } from "./define-toolbar-item";
import type { ViewBlockDefinition } from "./define-view-block";

interface ToolbarItemInstance {
  id: BlockInstanceId;
  key: string;
  config: Record<string, unknown>;
}

export class ViewsService {
  readonly #repo = inject(ViewsRepository);
  readonly #blockList = inject(ViewBlockDefinitionToken);
  readonly #itemList = inject(ToolbarItemDefinitionToken);
  readonly #logger = inject(LoggerFactoryToken).named("views-service");
  readonly #blocks: ReadonlyMap<string, ViewBlockDefinition>;
  readonly #items: ReadonlyMap<string, ToolbarItemDefinition>;

  constructor() {
    const blockMap = new Map<string, ViewBlockDefinition>();
    for (const definition of this.#blockList) blockMap.set(definition.key, definition);
    this.#blocks = blockMap;

    const itemMap = new Map<string, ToolbarItemDefinition>();
    for (const definition of this.#itemList) itemMap.set(definition.key, definition);
    this.#items = itemMap;
  }

  create(input: {
    name: string;
    icon?: string;
    defaultShelf?: string | null;
    showInRibbon?: boolean;
  }): AsyncResult<ViewId, ViewsLifecycleError> {
    return attempt.in(this, async function* () {
      const id = crypto.randomUUID() as ViewId;
      const view: View = {
        id,
        name: input.name,
        icon: input.icon ?? "calendar-days",
        defaultShelf: input.defaultShelf ?? null,
        showInRibbon: input.showInRibbon ?? false,
        blocks: [],
      };
      return yield* this.#repo.create(view);
    });
  }

  clone(id: ViewId): AsyncResult<ViewId, UnknownViewError | ViewsLifecycleError> {
    return attempt.in(this, async function* () {
      const source = yield* this.#repo.get(id).okOrElse(() => new UnknownViewError(id));
      const newId = crypto.randomUUID() as ViewId;
      const clone: View = {
        ...source,
        id: newId,
        name: `${source.name} (copy)`,
        blocks: source.blocks.map((b) => ({
          ...b,
          id: crypto.randomUUID() as BlockInstanceId,
          config: structuredClone(b.config),
        })),
      };
      return yield* this.#repo.create(clone);
    });
  }

  update(
    id: ViewId,
    patch: Partial<Pick<View, "name" | "icon" | "defaultShelf" | "showInRibbon">>,
  ): AsyncResult<void, UnknownViewError | ViewsLifecycleError> {
    return attempt.in(this, async function* () {
      if (patch.name?.trim().length === 0) {
        yield* new Err<never, ViewsLifecycleError>(new InvalidViewNameError(patch.name));
      }
      yield* this.#repo.update(id, patch).mapErr((cause): UnknownViewError => {
        if (cause.kind === "unknown-view") return cause;
        // patch type excludes `id`, so BaseRepository's id-collision branch is unreachable.
        throw new ViewsInvariantError(`unreachable: repo.update returned ${cause.kind}`);
      });
    });
  }

  delete(id: ViewId): AsyncResult<void, UnknownViewError> {
    return attempt.in(this, async function* () {
      yield* this.#repo.delete(id);
    });
  }

  addBlock(id: ViewId, key: string): AsyncResult<BlockInstanceId, UnknownViewError | UnknownViewBlockKeyError> {
    return attempt.in(this, async function* () {
      const current = yield* this.#repo.get(id).okOrElse(() => new UnknownViewError(id));
      const definition = yield* Option.fromNullable(this.#blocks.get(key) ?? null).okOrElse(
        () => new UnknownViewBlockKeyError(key),
      );
      const blockId = crypto.randomUUID() as BlockInstanceId;
      const blocks = [
        ...current.blocks,
        { id: blockId, key, config: definition.defaultConfig as Record<string, unknown> },
      ];
      yield* this.#repo.update(id, { blocks }).mapErr((cause) => {
        if (cause.kind === "unknown-view") return cause;
        throw new ViewsInvariantError(`unreachable: repo.update returned ${cause.kind}`);
      });
      return blockId;
    });
  }

  removeBlock(id: ViewId, blockId: BlockInstanceId): AsyncResult<void, UnknownViewError> {
    return attempt.in(this, async function* () {
      const current = yield* this.#repo.get(id).okOrElse(() => new UnknownViewError(id));
      const blocks = current.blocks.filter((b) => b.id !== blockId);
      if (blocks.length === current.blocks.length) return;
      yield* this.#repo.update(id, { blocks }).mapErr((cause): UnknownViewError => {
        if (cause.kind === "unknown-view") return cause;
        throw new ViewsInvariantError(`unreachable: repo.update returned ${cause.kind}`);
      });
    });
  }

  moveBlockUp(id: ViewId, blockId: BlockInstanceId): AsyncResult<void, UnknownViewError> {
    return this.#move(id, blockId, -1);
  }

  moveBlockDown(id: ViewId, blockId: BlockInstanceId): AsyncResult<void, UnknownViewError> {
    return this.#move(id, blockId, +1);
  }

  updateBlockConfig(
    id: ViewId,
    blockId: BlockInstanceId,
    config: unknown,
  ): AsyncResult<void, UnknownViewError | InvalidViewBlockConfigError> {
    return attempt.in(this, async function* () {
      const current = yield* this.#repo.get(id).okOrElse(() => new UnknownViewError(id));
      const target = current.blocks.find((b) => b.id === blockId);
      if (!target) return;
      const definition = this.#blocks.get(target.key);
      if (definition) {
        const parsed = v.safeParse(definition.schema, config);
        if (!parsed.success) {
          yield* new Err<never, InvalidViewBlockConfigError>(
            new InvalidViewBlockConfigError(id, blockId, target.key, parsed.issues),
          );
        }
      } else {
        this.#logger.warn("updateBlockConfig: block definition not registered; persisting without validation", {
          viewId: id,
          blockId,
          key: target.key,
        });
      }
      const blocks = current.blocks.map((b) =>
        b.id === blockId ? { ...b, config: config as Record<string, unknown> } : b,
      );
      yield* this.#repo.update(id, { blocks }).mapErr((cause): UnknownViewError => {
        if (cause.kind === "unknown-view") return cause;
        throw new ViewsInvariantError(`unreachable: repo.update returned ${cause.kind}`);
      });
    });
  }

  #move(id: ViewId, blockId: BlockInstanceId, delta: -1 | 1): AsyncResult<void, UnknownViewError> {
    return attempt.in(this, async function* () {
      const current = yield* this.#repo.get(id).okOrElse(() => new UnknownViewError(id));
      const index = current.blocks.findIndex((b) => b.id === blockId);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= current.blocks.length) return;
      const blocks = [...current.blocks];
      [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
      yield* this.#repo.update(id, { blocks }).mapErr((cause): UnknownViewError => {
        if (cause.kind === "unknown-view") return cause;
        throw new ViewsInvariantError(`unreachable: repo.update returned ${cause.kind}`);
      });
    });
  }

  getBlockDefinition(key: string): Option<ViewBlockDefinition> {
    return Option.fromNullable(this.#blocks.get(key));
  }

  addToolbarItem(
    id: ViewId,
    blockId: BlockInstanceId,
    itemKey: string,
    defaultConfig?: Record<string, unknown>,
  ): AsyncResult<BlockInstanceId, UnknownViewError | UnknownToolbarItemKeyError> {
    return attempt.in(this, async function* () {
      const current = yield* this.#repo.get(id).okOrElse(() => new UnknownViewError(id));
      const definition = yield* Option.fromNullable(this.#items.get(itemKey) ?? null).okOrElse(
        () => new UnknownToolbarItemKeyError(itemKey),
      );
      const targetBlock = current.blocks.find((b) => b.id === blockId);
      if (!targetBlock) return crypto.randomUUID() as BlockInstanceId;
      const items = (targetBlock.config as { items?: unknown }).items;
      if (!Array.isArray(items)) return crypto.randomUUID() as BlockInstanceId;
      const itemId = crypto.randomUUID() as BlockInstanceId;
      const newItem: ToolbarItemInstance = {
        id: itemId,
        key: itemKey,
        config: defaultConfig ?? (definition.defaultConfig as Record<string, unknown>),
      };
      const blocks = this.#withToolbarBlock(current, blockId, (existing) => [...existing, newItem]);
      yield* this.#repo.update(id, { blocks }).mapErr((cause): UnknownViewError => {
        if (cause.kind === "unknown-view") return cause;
        throw new ViewsInvariantError(`unreachable: repo.update returned ${cause.kind}`);
      });
      return itemId;
    });
  }

  removeToolbarItem(
    id: ViewId,
    blockId: BlockInstanceId,
    itemId: BlockInstanceId,
  ): AsyncResult<void, UnknownViewError> {
    return attempt.in(this, async function* () {
      const current = yield* this.#repo.get(id).okOrElse(() => new UnknownViewError(id));
      const targetBlock = current.blocks.find((b) => b.id === blockId);
      if (!targetBlock) return;
      const items = (targetBlock.config as { items?: unknown }).items;
      if (!Array.isArray(items)) return;
      const filtered = (items as ToolbarItemInstance[]).filter((i) => i.id !== itemId);
      if (filtered.length === items.length) return;
      const blocks = this.#withToolbarBlock(current, blockId, () => filtered);
      yield* this.#repo.update(id, { blocks }).mapErr((cause): UnknownViewError => {
        if (cause.kind === "unknown-view") return cause;
        throw new ViewsInvariantError(`unreachable: repo.update returned ${cause.kind}`);
      });
    });
  }

  moveToolbarItemUp(
    id: ViewId,
    blockId: BlockInstanceId,
    itemId: BlockInstanceId,
  ): AsyncResult<void, UnknownViewError> {
    return this.#moveToolbarItem(id, blockId, itemId, -1);
  }

  moveToolbarItemDown(
    id: ViewId,
    blockId: BlockInstanceId,
    itemId: BlockInstanceId,
  ): AsyncResult<void, UnknownViewError> {
    return this.#moveToolbarItem(id, blockId, itemId, +1);
  }

  updateToolbarItemConfig(
    id: ViewId,
    blockId: BlockInstanceId,
    itemId: BlockInstanceId,
    config: unknown,
  ): AsyncResult<void, UnknownViewError | InvalidToolbarItemConfigError> {
    return attempt.in(this, async function* () {
      const current = yield* this.#repo.get(id).okOrElse(() => new UnknownViewError(id));
      const targetBlock = current.blocks.find((b) => b.id === blockId);
      if (!targetBlock) return;
      const items = (targetBlock.config as { items?: unknown }).items;
      if (!Array.isArray(items)) return;
      const targetItem = (items as ToolbarItemInstance[]).find((i) => i.id === itemId);
      if (!targetItem) return;
      const definition = this.#items.get(targetItem.key);
      if (definition) {
        const parsed = v.safeParse(definition.schema, config);
        if (!parsed.success) {
          yield* new Err<never, InvalidToolbarItemConfigError>(
            new InvalidToolbarItemConfigError(id, blockId, itemId, targetItem.key, parsed.issues),
          );
        }
      } else {
        this.#logger.warn(
          "updateToolbarItemConfig: toolbar-item definition not registered; persisting without validation",
          { viewId: id, blockId, itemId, key: targetItem.key },
        );
      }
      const blocks = this.#withToolbarBlock(current, blockId, (existing) =>
        existing.map((i) => (i.id === itemId ? { ...i, config: config as Record<string, unknown> } : i)),
      );
      yield* this.#repo.update(id, { blocks }).mapErr((cause): UnknownViewError => {
        if (cause.kind === "unknown-view") return cause;
        throw new ViewsInvariantError(`unreachable: repo.update returned ${cause.kind}`);
      });
    });
  }

  getToolbarItemDefinition(key: string): Option<ToolbarItemDefinition> {
    return Option.fromNullable(this.#items.get(key));
  }

  #withToolbarBlock(
    current: View,
    blockId: BlockInstanceId,
    mutate: (items: ToolbarItemInstance[]) => ToolbarItemInstance[],
  ): View["blocks"] {
    return current.blocks.map((b) => {
      if (b.id !== blockId) return b;
      const items = (b.config as { items?: unknown }).items;
      if (!Array.isArray(items)) return b;
      return { ...b, config: { ...b.config, items: mutate(items as ToolbarItemInstance[]) } };
    });
  }

  #moveToolbarItem(
    id: ViewId,
    blockId: BlockInstanceId,
    itemId: BlockInstanceId,
    delta: -1 | 1,
  ): AsyncResult<void, UnknownViewError> {
    return attempt.in(this, async function* () {
      const current = yield* this.#repo.get(id).okOrElse(() => new UnknownViewError(id));
      const targetBlock = current.blocks.find((b) => b.id === blockId);
      if (!targetBlock) return;
      const items = (targetBlock.config as { items?: unknown }).items;
      if (!Array.isArray(items)) return;
      const typedItems = items as ToolbarItemInstance[];
      const index = typedItems.findIndex((i) => i.id === itemId);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= typedItems.length) return;
      const newItems = [...typedItems];
      [newItems[index], newItems[target]] = [newItems[target], newItems[index]];
      const blocks = this.#withToolbarBlock(current, blockId, () => newItems);
      yield* this.#repo.update(id, { blocks }).mapErr((cause): UnknownViewError => {
        if (cause.kind === "unknown-view") return cause;
        throw new ViewsInvariantError(`unreachable: repo.update returned ${cause.kind}`);
      });
    });
  }
}
