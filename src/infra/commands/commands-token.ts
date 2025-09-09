import { nanoid } from "nanoid";
import { CommandSymbol, type CommandHandler, type CommandToken } from "./commands.types";
import { createToken } from "../di/token";

export function createCommand<Payload extends object, Response extends object, ErrorType = Error>(commandName: string) {
  const instanceId = nanoid(10);

  return {
    name: `Command<${commandName}>`,
    handler: createToken<CommandHandler<Response, ErrorType>, [payload: Payload]>(`CommandHandler<${commandName}>`),
    [CommandSymbol]: true,
    instanceId,
    toString() {
      return this.name;
    },
  } as CommandToken<Payload, Response, ErrorType>;
}
