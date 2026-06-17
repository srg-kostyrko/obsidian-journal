import * as v from "valibot";

import { inject } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { Err, Ok, Option, type Result } from "@/infrastructure/result";

import { InvalidToolbarItemConfigError, UnknownToolbarItemKeyError } from "../../errors";
import { ToolbarItemDefinitionToken } from "../../tokens";

import { toolbarItemSchema, type ToolbarItemInstance } from "./toolbar-block";

import type { BlockInstanceId, View, ViewBlockInstance } from "../../config";
import type { ToolbarItemDefinition } from "../../define-toolbar-item";

export class ToolbarItemsService {
  readonly #itemList = inject(ToolbarItemDefinitionToken);
  readonly #logger = inject(LoggerFactoryToken).named("toolbar-items");
  readonly #items: ReadonlyMap<string, ToolbarItemDefinition>;

  constructor() {
    const map = new Map<string, ToolbarItemDefinition>();
    for (const definition of this.#itemList) map.set(definition.key, definition);
    this.#items = map;
  }

  getDefinition(key: string): Option<ToolbarItemDefinition> {
    return Option.fromNullable(this.#items.get(key));
  }

  itemsOf(block: ViewBlockInstance): ToolbarItemInstance[] {
    const raw = (block.config as { items?: unknown }).items ?? [];
    const parsed = v.safeParse(v.array(toolbarItemSchema), raw);
    return parsed.success ? parsed.output : [];
  }

  addItem(
    view: View,
    blockId: BlockInstanceId,
    itemKey: string,
    defaultConfig?: Record<string, unknown>,
  ): Result<{ blocks: View["blocks"]; itemId: BlockInstanceId } | null, UnknownToolbarItemKeyError> {
    const definition = this.#items.get(itemKey);
    if (!definition) return new Err(new UnknownToolbarItemKeyError(itemKey));
    const itemId = crypto.randomUUID() as BlockInstanceId;
    const newItem: ToolbarItemInstance = {
      id: itemId,
      key: itemKey,
      config: defaultConfig ?? (definition.defaultConfig as Record<string, unknown>),
    };
    const blocks = this.#withItems(view, blockId, (items) => [...items, newItem]);
    return new Ok(blocks === null ? null : { blocks, itemId });
  }

  removeItem(view: View, blockId: BlockInstanceId, itemId: BlockInstanceId): View["blocks"] | null {
    return this.#withItems(view, blockId, (items) => {
      const filtered = items.filter((i) => i.id !== itemId);
      return filtered.length === items.length ? null : filtered;
    });
  }

  reorder(view: View, blockId: BlockInstanceId, orderedIds: BlockInstanceId[]): View["blocks"] | null {
    return this.#withItems(view, blockId, (items) => {
      if (orderedIds.length !== items.length) return null;
      const byId = new Map(items.map((i) => [i.id, i]));
      if (new Set(orderedIds).size !== orderedIds.length || orderedIds.some((itemId) => !byId.has(itemId))) return null;
      return orderedIds.flatMap((itemId) => {
        const found = byId.get(itemId);
        return found ? [found] : [];
      });
    });
  }

  updateItemConfig(
    view: View,
    blockId: BlockInstanceId,
    itemId: BlockInstanceId,
    config: unknown,
  ): Result<View["blocks"] | null, InvalidToolbarItemConfigError> {
    const block = view.blocks.find((b) => b.id === blockId);
    if (!block) return new Ok(null);
    const target = this.itemsOf(block).find((i) => i.id === itemId);
    if (!target) return new Ok(null);

    const definition = this.#items.get(target.key);
    if (definition) {
      const parsed = v.safeParse(definition.schema, config);
      if (!parsed.success) {
        return new Err(new InvalidToolbarItemConfigError(view.id, blockId, itemId, target.key, parsed.issues));
      }
    } else {
      this.#logger.warn("updateItemConfig: toolbar-item definition not registered; persisting without validation", {
        viewId: view.id,
        blockId,
        itemId,
        key: target.key,
      });
    }

    const blocks = this.#withItems(view, blockId, (items) =>
      items.map((i) => (i.id === itemId ? { ...i, config: config as Record<string, unknown> } : i)),
    );
    return new Ok(blocks);
  }

  #withItems(
    view: View,
    blockId: BlockInstanceId,
    mutate: (items: ToolbarItemInstance[]) => ToolbarItemInstance[] | null,
  ): View["blocks"] | null {
    const block = view.blocks.find((b) => b.id === blockId);
    if (!block) return null;
    const next = mutate(this.itemsOf(block));
    if (next === null) return null;
    return view.blocks.map((b) => (b.id === blockId ? { ...b, config: { ...b.config, items: next } } : b));
  }
}
