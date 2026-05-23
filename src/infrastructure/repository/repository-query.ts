import { Option } from "@/infrastructure/result";

import type { RepositoryQueryContract } from "./types";

// Single-use iterator: every terminal method consumes the source. Call find() again for a fresh query.
export class RepositoryQuery<Id extends string, Entity> implements RepositoryQueryContract<Id, Entity> {
  constructor(
    protected source: IterableIterator<[Id, Entity]>,
    protected nameKey?: keyof Entity,
  ) {}

  first(): Option<Entity> {
    const next = this.source.next();
    if (next.done) return Option.none();
    return Option.some(next.value[1]);
  }

  *ids(): IterableIterator<Id> {
    for (const [id] of this.source) yield id;
  }

  *list(): IterableIterator<Entity> {
    for (const [, entity] of this.source) yield entity;
  }

  *options(): IterableIterator<{ value: Id; label: string }> {
    for (const [id, entity] of this.source) {
      const label = this.nameKey === undefined ? id : entity[this.nameKey];
      yield { value: id, label: String(label) };
    }
  }

  *map<T>(fn: (entity: Entity) => T): IterableIterator<T> {
    for (const [, entity] of this.source) yield fn(entity);
  }

  filter(predicate: (entity: Entity) => boolean): this {
    const source = this.source;
    const filtered = (function* () {
      for (const pair of source) {
        if (predicate(pair[1])) yield pair;
      }
    })();
    const Ctor = this.constructor as new (source: IterableIterator<[Id, Entity]>, nameKey?: keyof Entity) => this;
    return new Ctor(filtered, this.nameKey);
  }

  *[Symbol.iterator](): Iterator<Entity> {
    for (const [, entity] of this.source) yield entity;
  }
}
