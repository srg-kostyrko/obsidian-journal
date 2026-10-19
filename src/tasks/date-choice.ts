import * as v from "valibot";

import type { TaskDateRole } from "./types";

export const taskDateChoices = ["scheduled-or-due", "due", "scheduled", "start", "done", "created"] as const;

export type TaskDateChoice = (typeof taskDateChoices)[number];

export const taskDateChoiceSchema = v.picklist(taskDateChoices);

export function rolesOf(choice: TaskDateChoice): readonly TaskDateRole[] {
  return choice === "scheduled-or-due" ? ["scheduled", "due"] : [choice];
}
