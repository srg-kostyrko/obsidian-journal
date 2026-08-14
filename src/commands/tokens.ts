import { createToken } from "@/infrastructure/di";

import type { CommandsEvents } from "./repository";
import type { Emitter } from "nanoevents";

export const CommandsEventsToken = createToken<Emitter<CommandsEvents>>("commands.events");
