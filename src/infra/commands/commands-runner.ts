import { Result, type AsyncResult } from "../data-structures/result";
import { Injectable } from "../di/decorators/Injectable";
import type { TokenNotRegisteredError } from "../di/errors/TokenNotRegisteredError";
import { inject } from "../di/inject";
import { Injector } from "../di/injector";
import { Commands } from "./commands.tokens";
import type { CommandsRunner as CommandsRunnerContract, CommandToken } from "./commands.types";

@Injectable(Commands)
export class CommandsRunner implements CommandsRunnerContract {
  #injector = inject(Injector);

  execute<Payload extends object, Response extends object, ErrorType = Error>(
    token: CommandToken<Payload, Response, ErrorType>,
    payload: Payload,
  ): AsyncResult<Response, ErrorType | TokenNotRegisteredError> {
    return Result.try(() => {
      const handler = this.#injector.inject(token.handler, payload);
      return handler.handle();
    }) as AsyncResult<Response, ErrorType | TokenNotRegisteredError>;
  }
}
