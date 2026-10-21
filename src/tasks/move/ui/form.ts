import { m } from "@/i18n";

import type { JournalMoveConfig } from "../settings";

export type ModeChoice = "default" | "copy" | "move";
export type StampChoice = "default" | "on" | "off";

export interface JournalMoveDraft {
  mode: ModeChoice;
  stamp: StampChoice;
  source: JournalMoveConfig["source"];
  targetHeading: string;
  // An emptied number input reads back "" at runtime, which Number.isSafeInteger rejects.
  lookBack: number | undefined;
}

// placeGroups matches a heading by its text, so "## Tasks" typed the way it reads in the note would
// never match anything.
export function headingText(text: string): string {
  return text
    .trim()
    .replace(/^#{1,6}\s+/u, "")
    .trim();
}

export function stampChoice(stamp: boolean): "on" | "off" {
  return stamp ? "on" : "off";
}

export function draftFrom(move: JournalMoveConfig): JournalMoveDraft {
  return {
    mode: move.mode ?? "default",
    stamp: move.stamp === undefined ? "default" : stampChoice(move.stamp),
    source: move.source,
    targetHeading: move.targetHeading,
    lookBack: move.lookBack,
  };
}

function validLookBack(value: JournalMoveDraft["lookBack"]): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value >= 1;
}

export function journalMoveErrors(draft: JournalMoveDraft): { lookBack?: string[] } {
  return validLookBack(draft.lookBack) ? {} : { lookBack: [m.tasks_move_look_back_invalid()] };
}

/** The stored config for a valid draft; a Default choice leaves its field absent. */
export function configFrom(draft: JournalMoveDraft): JournalMoveConfig {
  const lookBack = validLookBack(draft.lookBack) ? draft.lookBack : 1;
  return {
    ...(draft.mode !== "default" && { mode: draft.mode }),
    ...(draft.stamp !== "default" && { stamp: draft.stamp === "on" }),
    source: draft.source,
    targetHeading: headingText(draft.targetHeading),
    lookBack,
  };
}
