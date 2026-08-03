import { createToken } from "@/infrastructure/di";
import type { AsyncResult } from "@/infrastructure/result";

import type { CalendarSliceState } from "./slice";

// Applying a week preset also has to re-anchor every weekly note, which only the journals
// layer can do. Calendar declares the seam and journals registers the implementation, because
// an import the other way (calendar -> journals) would close a module cycle.
export interface WeekPresetApplier {
  apply(next: CalendarSliceState): AsyncResult<void, never>;
}

export const WeekPresetApplierToken = createToken<WeekPresetApplier>("calendar.weekPresetApplier");
