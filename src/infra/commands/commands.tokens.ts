import { createToken } from "../di/token";
import type { CommandsRunner } from "./commands.types";

export const Commands = createToken<CommandsRunner>("Commands");
