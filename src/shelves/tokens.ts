import { createToken } from "@/infrastructure/di";

import type { ShelvesEvents } from "./repository";
import type { Emitter } from "nanoevents";

export const ShelvesEventsToken = createToken<Emitter<ShelvesEvents>>("shelves.events");
