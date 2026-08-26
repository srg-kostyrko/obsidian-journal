import { inject } from "@/infrastructure/di";
import { BaseRepository, RepositoryQuery, type RepositoryEvents } from "@/infrastructure/repository";
import { Err, Ok, type Result } from "@/infrastructure/result";
import { SettingsService } from "@/settings";

import { commandCollection, type CommandConfig } from "./config";
import { CommandIdTakenError, InvalidCommandUpdateError, UnknownCommandError } from "./errors";
import { CommandsEventsToken } from "./tokens";

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

  create(id: string, init: CommandConfig): Result<CommandConfig, CommandIdTakenError> {
    const result = this.addEntity(id, init);
    if (result.kind === "err") return new Err(new CommandIdTakenError(id));
    return new Ok(init);
  }
}
