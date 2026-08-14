import { cloneFnJSON } from "@vueuse/core";
import * as v from "valibot";

import { inject } from "@/infrastructure/di";
import { LoggerFactoryToken } from "@/infrastructure/logger";
import { attempt, Err, Option, type AsyncResult, type Result } from "@/infrastructure/result";
import { ShelvesEventsToken } from "@/shelves";

import { ToolbarItemsService } from "./blocks/toolbar/toolbar-items-service";
import {
  type InvalidToolbarItemConfigError,
  InvalidViewBlockConfigError,
  InvalidViewNameError,
  type UnknownToolbarItemKeyError,
  UnknownViewBlockKeyError,
  UnknownViewError,
  ViewsInvariantError,
  type ViewsLifecycleError,
} from "./errors";
import { ViewsRepository } from "./repository";
import { ViewBlockDefinitionToken } from "./tokens";

import type { BlockInstanceId, View, ViewId } from "./config";
import type { ToolbarItemDefinition } from "./define-toolbar-item";
import type { ViewBlockDefinition } from "./define-view-block";

export class ViewsService {
  readonly #repo = inject(ViewsRepository);
  readonly #blockList = inject(ViewBlockDefinitionToken);
  readonly #toolbarItems = inject(ToolbarItemsService);
  readonly #logger = inject(LoggerFactoryToken).named("views-service");
  readonly #blocks: ReadonlyMap<string, ViewBlockDefinition>;

  constructor(shelvesEvents = inject(ShelvesEventsToken)) {
    const blockMap = new Map<string, ViewBlockDefinition>();
    for (const definition of this.#blockList) blockMap.set(definition.key, definition);
    this.#blocks = blockMap;

    // A view holds its shelf by name, so nothing else keeps that reference valid: a rename or
    // delete would leave defaultShelf pointing at a shelf that no longer resolves, and the view
    // would silently scope to no journals at all. ShelvesService maintains its own journal
    // references the same way.
    shelvesEvents.on("renamed", (oldName, newName) => this.#updateShelfReference(oldName, newName));
    shelvesEvents.on("deleted", (name) => this.#updateShelfReference(name, null));
  }

  // A deleted shelf falls back to unscoped (all journals) rather than following the delete
  // modal's destination: that destination re-homes the shelf's journals, which is not the same
  // question as what a view should show. Unscoped stays visible and the user can re-scope.
  #updateShelfReference(oldName: string, newShelf: string | null): void {
    for (const view of this.#repo.find().list()) {
      if (view.defaultShelf !== oldName) continue;
      this.#repo.update(view.id, { defaultShelf: newShelf }).tapErr((error) => {
        this.#logger.error("failed to update a view's shelf reference", { view: view.id, error });
      });
    }
  }

  #persistBlocks(id: ViewId, blocks: View["blocks"]): Result<void, UnknownViewError> {
    return this.#repo.update(id, { blocks }).mapErr((cause): UnknownViewError => {
      if (cause.kind === "unknown-view") return cause;
      throw new ViewsInvariantError(`unreachable: repo.update returned ${cause.kind}`);
    });
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
        icon: input.icon ?? "",
        defaultShelf: input.defaultShelf ?? null,
        showInRibbon: input.showInRibbon ?? false,
        leaf: "right",
        openOnStartup: false,
        rememberDate: false,
        followActiveDate: true,
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
          // Settings storage is deeply reactive, so config can hold reactive proxies nested at any
          // depth (e.g. a config editor spreads the store object). structuredClone rejects proxies
          // and a shallow toRaw leaves the nested ones, so deep-clone through JSON — config is
          // JSON-serializable persisted data — which strips reactivity at every level.
          config: cloneFnJSON(b.config),
        })),
      };
      return yield* this.#repo.create(clone);
    });
  }

  update(
    id: ViewId,
    patch: Partial<
      Pick<
        View,
        | "name"
        | "icon"
        | "defaultShelf"
        | "showInRibbon"
        | "leaf"
        | "openOnStartup"
        | "rememberDate"
        | "followActiveDate"
      >
    >,
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
      // defaultConfig is a shared module-level object, so storing it directly would let one block's
      // edits rewrite the default every later block of this type starts from.
      const config = cloneFnJSON(definition.defaultConfig as Record<string, unknown>);
      const blocks = [...current.blocks, { id: blockId, key, config }];
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

  setBlockOrder(id: ViewId, orderedIds: BlockInstanceId[]): AsyncResult<void, UnknownViewError> {
    return attempt.in(this, async function* () {
      const current = yield* this.#repo.get(id).okOrElse(() => new UnknownViewError(id));
      const byId = new Map(current.blocks.map((b) => [b.id, b]));
      if (
        orderedIds.length !== current.blocks.length ||
        new Set(orderedIds).size !== orderedIds.length ||
        orderedIds.some((blockId) => !byId.has(blockId))
      ) {
        this.#logger.warn("setBlockOrder: ids are not a permutation of current blocks; ignoring", { viewId: id });
        return;
      }
      const blocks = orderedIds.flatMap((blockId) => {
        const block = byId.get(blockId);
        return block ? [block] : [];
      });
      yield* this.#persistBlocks(id, blocks);
    });
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

  getBlockDefinition(key: string): Option<ViewBlockDefinition> {
    return Option.fromNullable(this.#blocks.get(key));
  }

  addToolbarItem(
    id: ViewId,
    blockId: BlockInstanceId,
    itemKey: string,
    defaultConfig?: Record<string, unknown>,
  ): AsyncResult<BlockInstanceId | null, UnknownViewError | UnknownToolbarItemKeyError> {
    return attempt.in(this, async function* () {
      const current = yield* this.#repo.get(id).okOrElse(() => new UnknownViewError(id));
      const outcome = yield* this.#toolbarItems.addItem(current, blockId, itemKey, defaultConfig);
      if (outcome === null) return null;
      yield* this.#persistBlocks(id, outcome.blocks);
      return outcome.itemId;
    });
  }

  removeToolbarItem(
    id: ViewId,
    blockId: BlockInstanceId,
    itemId: BlockInstanceId,
  ): AsyncResult<void, UnknownViewError> {
    return attempt.in(this, async function* () {
      const current = yield* this.#repo.get(id).okOrElse(() => new UnknownViewError(id));
      const blocks = this.#toolbarItems.removeItem(current, blockId, itemId);
      if (blocks === null) return;
      yield* this.#persistBlocks(id, blocks);
    });
  }

  setToolbarItemOrder(
    id: ViewId,
    blockId: BlockInstanceId,
    orderedIds: BlockInstanceId[],
  ): AsyncResult<void, UnknownViewError> {
    return attempt.in(this, async function* () {
      const current = yield* this.#repo.get(id).okOrElse(() => new UnknownViewError(id));
      const blocks = this.#toolbarItems.reorder(current, blockId, orderedIds);
      if (blocks === null) return;
      yield* this.#persistBlocks(id, blocks);
    });
  }

  updateToolbarItemConfig(
    id: ViewId,
    blockId: BlockInstanceId,
    itemId: BlockInstanceId,
    config: unknown,
  ): AsyncResult<void, UnknownViewError | InvalidToolbarItemConfigError> {
    return attempt.in(this, async function* () {
      const current = yield* this.#repo.get(id).okOrElse(() => new UnknownViewError(id));
      const blocks = yield* this.#toolbarItems.updateItemConfig(current, blockId, itemId, config);
      if (blocks === null) return;
      yield* this.#persistBlocks(id, blocks);
    });
  }

  getToolbarItemDefinition(key: string): Option<ToolbarItemDefinition> {
    return this.#toolbarItems.getDefinition(key);
  }
}
