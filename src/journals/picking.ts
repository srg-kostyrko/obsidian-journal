import { match } from "ts-pattern";

import type { Picking } from "@/calendar/ui";

import type { JournalWrite } from "./config";

export function pickingForWrite(write: JournalWrite): Picking {
  return match(write)
    .with({ type: "week" }, () => "week" as const)
    .with({ type: "month" }, () => "month" as const)
    .with({ type: "quarter" }, () => "quarter" as const)
    .with({ type: "year" }, () => "year" as const)
    .otherwise(() => "day" as const);
}
