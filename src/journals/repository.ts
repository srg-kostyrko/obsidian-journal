import { cloneFnJSON } from "@vueuse/core";

import { inject } from "@/infrastructure/di";
import { BaseRepository, RepositoryQuery, type RepositoryEvents } from "@/infrastructure/repository";
import { Err, Ok, type Result } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { journalConfigCollection, journalDefaultsFor, type JournalConfig, type JournalWrite } from "./config";
import {
  InvalidJournalNameError,
  InvalidJournalUpdateError,
  JournalNameTakenError,
  JournalNotFoundError,
  UnknownJournalError,
} from "./errors";
import { JournalsEventsToken } from "./tokens";

import type { NoteletType, TypeId } from "./notelets/config";

export interface JournalsEvents extends RepositoryEvents<string, JournalConfig> {
  renamed: (oldName: string, newName: string) => void;
  cloned: (sourceName: string, newName: string) => void;
  // A notelet type's lifecycle is announced rather than acted on here: commands are seeded and
  // deleted by the commands module, which subscribes the way it does for journal rename and
  // clone. A journals-side write into CommandsRepository would invert every other edge.
  noteletTypeAdded: (journalName: string, type: NoteletType) => void;
  noteletTypeDeleted: (journalName: string, typeId: TypeId) => void;
}

export class JournalsRepository extends BaseRepository<
  string,
  JournalConfig,
  UnknownJournalError,
  InvalidJournalUpdateError,
  RepositoryQuery<string, JournalConfig>,
  JournalsEvents
> {
  protected idKey: keyof JournalConfig = "name";
  protected nameKey: keyof JournalConfig = "name";
  protected QueryConstructor = RepositoryQuery;
  protected storage = inject(SettingsService).recordOf(journalConfigCollection);
  protected events = inject(JournalsEventsToken);
  protected unknownEntityError = (name: string) => new UnknownJournalError(name);
  protected invalidUpdateError = (name: string) => new InvalidJournalUpdateError(name);

  require(name: string): Result<JournalConfig, JournalNotFoundError> {
    return this.get(name).okOrElse(() => new JournalNotFoundError(name));
  }

  create(name: string, write: JournalWrite): Result<JournalConfig, InvalidJournalNameError | JournalNameTakenError> {
    if (name.length === 0) return new Err(new InvalidJournalNameError(name));
    const entity = journalDefaultsFor(write, name);
    const result = this.addEntity(name, entity);
    if (result.kind === "err") return new Err(new JournalNameTakenError(name));
    return new Ok(entity);
  }

  clone(
    sourceName: string,
    newName: string,
  ): Result<JournalConfig, InvalidJournalNameError | JournalNameTakenError | UnknownJournalError> {
    if (newName.length === 0) return new Err(new InvalidJournalNameError(newName));
    const source = this.storage[sourceName];
    if (source === undefined) return new Err(new UnknownJournalError(sourceName));
    // The stored config is a reactive proxy with nested objects; a shallow copy would leave the
    // copy's arrays and nested records shared with the source.
    const entity: JournalConfig = { ...cloneFnJSON(source), name: newName };
    const result = this.addEntity(newName, entity);
    if (result.kind === "err") return new Err(new JournalNameTakenError(newName));
    this.events.emit("cloned", sourceName, newName);
    return new Ok(entity);
  }

  rename(
    oldName: string,
    newName: string,
  ): Result<void, UnknownJournalError | InvalidJournalNameError | JournalNameTakenError> {
    if (newName.length === 0 || newName === oldName) return new Err(new InvalidJournalNameError(newName));
    if (!Object.hasOwn(this.storage, oldName)) return new Err(new UnknownJournalError(oldName));
    if (Object.hasOwn(this.storage, newName)) return new Err(new JournalNameTakenError(newName));
    const existing = this.storage[oldName];
    existing.name = newName;
    delete this.storage[oldName];
    this.storage[newName] = existing;
    this.events.emit("renamed", oldName, newName);
    return new Ok(undefined);
  }

  addNoteletType(journalName: string, type: NoteletType): Result<void, UnknownJournalError> {
    return this.get(journalName)
      .okOrElse(() => new UnknownJournalError(journalName))
      .map((config) => {
        this.update(journalName, { notelets: { ...config.notelets, [type.id]: type } });
        this.events.emit("noteletTypeAdded", journalName, type);
      });
  }

  deleteNoteletType(journalName: string, typeId: TypeId): Result<void, UnknownJournalError> {
    return this.get(journalName)
      .okOrElse(() => new UnknownJournalError(journalName))
      .map((config) => {
        const { [typeId]: _removed, ...rest } = config.notelets;
        this.update(journalName, { notelets: rest });
        this.events.emit("noteletTypeDeleted", journalName, typeId);
      });
  }
}
