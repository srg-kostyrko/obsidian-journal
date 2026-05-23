import { inject } from "@/infrastructure/di";
import { BaseRepository, RepositoryQuery, type RepositoryEvents } from "@/infrastructure/repository";
import { Err, Ok, type Result } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { commandCollection, type CommandConfig } from "./config";
import { CommandIdTakenError, InvalidCommandUpdateError, UnknownCommandError } from "./errors";
import { CommandsEventsToken } from "./tokens";

import type { Emitter } from "nanoevents";

export type CommandsEvents = RepositoryEvents<string, CommandConfig>;

export class CommandsRepository extends BaseRepository<
  string,
  CommandConfig,
  UnknownCommandError,
  InvalidCommandUpdateError,
  RepositoryQuery<string, CommandConfig>,
  CommandsEvents
> {
  protected idKey: keyof CommandConfig | undefined = undefined;
  protected nameKey: keyof CommandConfig = "name";
  protected QueryConstructor = RepositoryQuery;
  protected storage = inject(SettingsService).recordOf(commandCollection);
  protected events = inject(CommandsEventsToken);
  protected unknownEntityError = (id: string) => new UnknownCommandError(id);
  protected invalidUpdateError = (id: string) => new InvalidCommandUpdateError(id);

  static fromParts(storage: Record<string, CommandConfig>, events: Emitter<CommandsEvents>): CommandsRepository {
    const repo = Object.create(CommandsRepository.prototype) as CommandsRepository;
    interface Mutable {
      idKey: keyof CommandConfig | undefined;
      nameKey: keyof CommandConfig;
      QueryConstructor: typeof RepositoryQuery;
      storage: Record<string, CommandConfig>;
      events: Emitter<CommandsEvents>;
      unknownEntityError: (id: string) => UnknownCommandError;
      invalidUpdateError: (id: string) => InvalidCommandUpdateError;
    }
    const w = repo as unknown as Mutable;
    w.idKey = undefined;
    w.nameKey = "name";
    w.QueryConstructor = RepositoryQuery;
    w.storage = storage;
    w.events = events;
    w.unknownEntityError = (id) => new UnknownCommandError(id);
    w.invalidUpdateError = (id) => new InvalidCommandUpdateError(id);
    return repo;
  }

  create(id: string, init: CommandConfig): Result<CommandConfig, CommandIdTakenError> {
    if (id in this.storage) return new Err(new CommandIdTakenError(id));
    const result = this.addEntity(id, init);
    if (result.kind === "err") return new Err(new CommandIdTakenError(id));
    return new Ok(init);
  }
}
