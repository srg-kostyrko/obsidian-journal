import { inject } from "@/infrastructure/di";
import { attempt, Err, Option, type AsyncResult } from "@/infrastructure/result";

import { InvalidViewNameError, UnknownViewError, type ViewsLifecycleError } from "./errors";
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
      yield* this.#repo
        .update(id, patch)
        .mapErr((cause): UnknownViewError | ViewsLifecycleError =>
          cause.kind === "unknown-view" ? cause : new InvalidViewNameError(patch.name ?? ""),
        );
    });
  }

  delete(id: ViewId): AsyncResult<void, UnknownViewError> {
    return attempt.in(this, async function* () {
      yield* this.#repo.delete(id);
    });
  }

  getBlockDefinition(key: string): Option<ViewBlockDefinition> {
    return Option.fromNullable(this.#blocks.get(key));
  }
}
