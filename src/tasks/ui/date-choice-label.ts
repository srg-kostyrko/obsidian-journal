import { match } from "ts-pattern";

import { m } from "@/i18n";

import type { TaskDateChoice } from "../date-choice";

export function taskDateChoiceLabel(choice: TaskDateChoice): string {
  return match(choice)
    .with("scheduled-or-due", () => m.tasks_date_choice_scheduled_or_due())
    .with("due", () => m.tasks_date_choice_due())
    .with("scheduled", () => m.tasks_date_choice_scheduled())
    .with("start", () => m.tasks_date_choice_start())
    .with("done", () => m.tasks_date_choice_done())
    .with("created", () => m.tasks_date_choice_created())
    .exhaustive();
}
