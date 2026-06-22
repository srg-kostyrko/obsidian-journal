import { inject } from "@/infrastructure/di";
import { BaseRepository, RepositoryQuery, type RepositoryEvents } from "@/infrastructure/repository";
import { Err, Ok, type Result } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { shelvesCollection, type ShelfConfig } from "./config";
import { InvalidShelfNameError, InvalidShelfUpdateError, ShelfNameTakenError, UnknownShelfError } from "./errors";
import { ShelvesEventsToken } from "./tokens";

import type { Emitter } from "nanoevents";

export interface ShelvesEvents extends RepositoryEvents<string, ShelfConfig> {
  renamed: (oldName: string, newName: string) => void;
}

export class ShelvesRepository extends BaseRepository<
  string,
  ShelfConfig,
  UnknownShelfError,
  InvalidShelfUpdateError,
  RepositoryQuery<string, ShelfConfig>,
  ShelvesEvents
> {
  static fromParts(storage: Record<string, ShelfConfig>, events: Emitter<ShelvesEvents>): ShelvesRepository {
    const repo = Object.create(this.prototype) as ShelvesRepository;
    interface Mutable {
      idKey: keyof ShelfConfig;
      nameKey: keyof ShelfConfig;
      QueryConstructor: typeof RepositoryQuery;
      storage: Record<string, ShelfConfig>;
      events: Emitter<ShelvesEvents>;
      unknownEntityError: (name: string) => UnknownShelfError;
      invalidUpdateError: (name: string) => InvalidShelfUpdateError;
    }
    const w = repo as unknown as Mutable;
    w.idKey = "name";
    w.nameKey = "name";
    w.QueryConstructor = RepositoryQuery;
    w.storage = storage;
    w.events = events;
    w.unknownEntityError = (name) => new UnknownShelfError(name);
    w.invalidUpdateError = (name) => new InvalidShelfUpdateError(name);
    return repo;
  }

  protected idKey: keyof ShelfConfig = "name";
  protected nameKey: keyof ShelfConfig = "name";
  protected QueryConstructor = RepositoryQuery;
  protected storage = inject(SettingsService).recordOf(shelvesCollection);
  protected events = inject(ShelvesEventsToken);
  protected unknownEntityError = (name: string) => new UnknownShelfError(name);
  protected invalidUpdateError = (name: string) => new InvalidShelfUpdateError(name);

  create(name: string): Result<ShelfConfig, InvalidShelfNameError | ShelfNameTakenError> {
    if (name.length === 0) return new Err(new InvalidShelfNameError(name));
    const entity: ShelfConfig = { name, journals: [] };
    const result = this.addEntity(name, entity);
    if (result.kind === "err") return new Err(new ShelfNameTakenError(name));
    return new Ok(entity);
  }

  rename(
    oldName: string,
    newName: string,
  ): Result<void, UnknownShelfError | InvalidShelfNameError | ShelfNameTakenError> {
    if (newName.length === 0 || newName === oldName) return new Err(new InvalidShelfNameError(newName));
    if (!Object.hasOwn(this.storage, oldName)) return new Err(new UnknownShelfError(oldName));
    if (Object.hasOwn(this.storage, newName)) return new Err(new ShelfNameTakenError(newName));
    const existing = this.storage[oldName];
    existing.name = newName;
    delete this.storage[oldName];
    this.storage[newName] = existing;
    this.events.emit("renamed", oldName, newName);
    return new Ok(undefined);
  }

  deleteWith(name: string, destinationShelf?: string): Result<void, UnknownShelfError> {
    if (!Object.hasOwn(this.storage, name)) return new Err(new UnknownShelfError(name));
    const source = this.storage[name];
    if (destinationShelf !== undefined) {
      if (!Object.hasOwn(this.storage, destinationShelf)) return new Err(new UnknownShelfError(destinationShelf));
      this.storage[destinationShelf].journals.push(...source.journals);
    }
    delete this.storage[name];
    this.events.emit("deleted", name);
    return new Ok(undefined);
  }
}
