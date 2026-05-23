import { inject } from "@/infrastructure/di";
import { BaseRepository, RepositoryQuery, type RepositoryEvents } from "@/infrastructure/repository";
import { Err, Ok, type Result } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { journalConfigCollection, journalDefaultsFor, type JournalConfig, type JournalWrite } from "./config";
import {
  InvalidJournalNameError,
  InvalidJournalUpdateError,
  JournalNameTakenError,
  UnknownJournalError,
} from "./errors";
import { JournalsEventsToken } from "./tokens";

import type { Emitter } from "nanoevents";

export interface JournalsEvents extends RepositoryEvents<string, JournalConfig> {
  renamed: (oldName: string, newName: string) => void;
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
  protected storage = inject(SettingsService).recordOf(journalConfigCollection) as Record<string, JournalConfig>;
  protected events = inject(JournalsEventsToken);
  protected unknownEntityError = (name: string) => new UnknownJournalError(name);
  protected invalidUpdateError = (name: string) => new InvalidJournalUpdateError(name);

  static fromParts(storage: Record<string, JournalConfig>, events: Emitter<JournalsEvents>): JournalsRepository {
    const repo = Object.create(JournalsRepository.prototype) as JournalsRepository;
    interface Mutable {
      idKey: keyof JournalConfig;
      nameKey: keyof JournalConfig;
      QueryConstructor: typeof RepositoryQuery;
      storage: Record<string, JournalConfig>;
      events: Emitter<JournalsEvents>;
      unknownEntityError: (name: string) => UnknownJournalError;
      invalidUpdateError: (name: string) => InvalidJournalUpdateError;
    }
    const w = repo as unknown as Mutable;
    w.idKey = "name";
    w.nameKey = "name";
    w.QueryConstructor = RepositoryQuery;
    w.storage = storage;
    w.events = events;
    w.unknownEntityError = (name) => new UnknownJournalError(name);
    w.invalidUpdateError = (name) => new InvalidJournalUpdateError(name);
    return repo;
  }

  create(name: string, write: JournalWrite): Result<JournalConfig, InvalidJournalNameError | JournalNameTakenError> {
    if (name.length === 0) return new Err(new InvalidJournalNameError(name));
    if (name in this.storage) return new Err(new JournalNameTakenError(name));
    const entity = journalDefaultsFor(write, name);
    const result = this.addEntity(name, entity);
    if (result.kind === "err") return new Err(new JournalNameTakenError(name));
    return new Ok(entity);
  }

  rename(
    oldName: string,
    newName: string,
  ): Result<void, UnknownJournalError | InvalidJournalNameError | JournalNameTakenError> {
    if (newName.length === 0 || newName === oldName) return new Err(new InvalidJournalNameError(newName));
    if (!(oldName in this.storage)) return new Err(new UnknownJournalError(oldName));
    if (newName in this.storage) return new Err(new JournalNameTakenError(newName));
    const existing = this.storage[oldName];
    existing.name = newName;
    delete this.storage[oldName];
    this.storage[newName] = existing;
    this.events.emit("renamed", oldName, newName);
    return new Ok(undefined);
  }
}
