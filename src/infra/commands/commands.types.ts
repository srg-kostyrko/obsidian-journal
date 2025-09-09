import type { AsyncResult } from "../data-structures/result";
import type { Token } from "../di/contracts/token.types";
import type { TokenNotRegisteredError } from "../di/errors/TokenNotRegisteredError";

export const CommandSymbol = Symbol("Command");

export interface CommandHandler<Response extends object, ErrorType = Error> {
  handle(): AsyncResult<Response, ErrorType>;
}

export interface CommandToken<Payload extends object, Response extends object, ErrorType = Error> {
  readonly name: string;
  handler: Token<CommandHandler<Response, ErrorType>, [payload: Payload]>;
}

export interface CommandsRunner {
  execute<Payload extends object, Response extends object, ErrorType = Error>(
    token: CommandToken<Payload, Response, ErrorType>,
    payload: Payload,
  ): AsyncResult<Response, ErrorType | TokenNotRegisteredError>;
}
