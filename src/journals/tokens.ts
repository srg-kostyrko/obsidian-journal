import { createToken } from "@/infrastructure/di";

import type { JournalsEvents } from "./repository";
import type { Emitter } from "nanoevents";

export const JournalsEventsToken = createToken<Emitter<JournalsEvents>>("journals.events");
