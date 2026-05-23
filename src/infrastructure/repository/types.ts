import type { Option, Result } from "@/infrastructure/result";

export interface RepositoryEvents<Id extends string, Entity> {
  created: (id: Id) => void;
  updated: (id: Id, changes: Partial<Entity>) => void;
  deleted: (id: Id) => void;
}

export interface RepositoryQueryContract<Id extends string, Entity> {
  first(): Option<Entity>;
  ids(): IterableIterator<Id>;
  list(): IterableIterator<Entity>;
  options(): IterableIterator<{ value: Id; label: string }>;
  map<T>(fn: (entity: Entity) => T): IterableIterator<T>;
  filter(predicate: (entity: Entity) => boolean): this;
  [Symbol.iterator](): Iterator<Entity>;
}

export interface RepositoryContract<
  Id extends string,
  Entity,
  EUnknown extends Error,
  EInvalidUpdate extends Error,
  Q extends RepositoryQueryContract<Id, Entity> = RepositoryQueryContract<Id, Entity>,
> {
  count(): number;
  exists(id: Id): boolean;
  get(id: Id): Option<Entity>;
  find(): Q;
  update(id: Id, changes: Partial<Entity>): Result<void, EUnknown | EInvalidUpdate>;
  delete(id: Id): Result<void, EUnknown>;
}
