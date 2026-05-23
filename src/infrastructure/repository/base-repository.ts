import { Err, Ok, Option } from "@/infrastructure/result";
import type { Result } from "@/infrastructure/result";

import type { RepositoryQuery } from "./repository-query";
import type { RepositoryEvents, RepositoryQueryContract } from "./types";
import type { Emitter } from "nanoevents";

export abstract class BaseRepository<
  Id extends string,
  Entity,
  EUnknown extends Error,
  EInvalidUpdate extends Error,
  Q extends RepositoryQueryContract<Id, Entity> = RepositoryQuery<Id, Entity>,
  E extends RepositoryEvents<Id, Entity> = RepositoryEvents<Id, Entity>,
> {
  protected abstract idKey?: keyof Entity;
  protected abstract nameKey?: keyof Entity;
  protected abstract QueryConstructor: new (source: IterableIterator<[Id, Entity]>, nameKey?: keyof Entity) => Q;
  protected abstract storage: Record<Id, Entity>;
  protected abstract events: Emitter<E>;
  protected abstract unknownEntityError: (id: Id) => EUnknown;
  protected abstract invalidUpdateError: (id: Id, changes: Partial<Entity>) => EInvalidUpdate;

  count(): number {
    return Object.keys(this.storage).length;
  }

  exists(id: Id): boolean {
    return id in this.storage;
  }

  get(id: Id): Option<Entity> {
    return Option.fromNullable(this.storage[id]);
  }

  find(): Q {
    const source = Object.entries(this.storage)[Symbol.iterator]() as IterableIterator<[Id, Entity]>;
    return new this.QueryConstructor(source, this.nameKey);
  }

  update(id: Id, changes: Partial<Entity>): Result<void, EUnknown | EInvalidUpdate> {
    const existing = this.storage[id];
    if (!existing) return new Err(this.unknownEntityError(id));
    if (this.idKey !== undefined && this.idKey in changes) {
      const next = (changes as Record<keyof Entity, unknown>)[this.idKey];
      if (next !== existing[this.idKey]) {
        return new Err(this.invalidUpdateError(id, changes));
      }
    }
    this.storage[id] = { ...existing, ...changes };
    (this.events as Emitter<RepositoryEvents<Id, Entity>>).emit("updated", id, changes);
    return new Ok(undefined);
  }

  delete(id: Id): Result<void, EUnknown> {
    if (!(id in this.storage)) return new Err(this.unknownEntityError(id));
    delete this.storage[id];
    (this.events as Emitter<RepositoryEvents<Id, Entity>>).emit("deleted", id);
    return new Ok(undefined);
  }

  protected addEntity(id: Id, entity: Entity): Result<Id, EUnknown> {
    if (id in this.storage) return new Err(this.unknownEntityError(id));
    this.storage[id] = entity;
    (this.events as Emitter<RepositoryEvents<Id, Entity>>).emit("created", id);
    return new Ok(id);
  }
}
