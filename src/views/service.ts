import * as v from "valibot";

import { inject } from "@/infrastructure/di";
import { attempt, Err, Option, type AsyncResult } from "@/infrastructure/result";

import {
  InvalidViewBlockConfigError,
  InvalidViewNameError,
  UnknownViewBlockKeyError,
  UnknownViewError,
  ViewsInvariantError,
  type ViewsLifecycleError,
} from "./errors";
import { ViewsRepository } from "./repository";
import { ViewBlockDefinitionToken } from "./tokens";

import type { BlockInstanceId, View, ViewId } from "./config";
import type { ViewBlockDefinition } from "./define-view-block";

export class ViewsService {
  readonly #repo = inject(ViewsRepository);
  readonly #blockList = inject(ViewBlockDefinitionToken);
  readonly #blocks: ReadonlyMap<string, ViewBlockDefinition>;

  constructor() {
    const map = new Map<string, ViewBlockDefinition>();
    for (const definition of this.#blockList) map.set(definition.key, definition);
    this.#blocks = map;
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
}
