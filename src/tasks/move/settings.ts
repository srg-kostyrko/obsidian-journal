// Leaf on purpose: journalConfigSchema imports this file and the tasks module imports journals —
// any further import here closes a cycle. valibot and the settings schema factory only.
import * as v from "valibot";

import { defineSlice } from "@/settings/schema";

const moveModeSchema = v.picklist(["copy", "move"]);

export const moveDefaultsSchema = v.object({
  mode: v.optional(moveModeSchema, "copy"),
  stamp: v.optional(v.boolean(), true),
});

export type MoveDefaults = v.InferOutput<typeof moveDefaultsSchema>;

export const moveDefaultsSlice = defineSlice<"tasksMove", typeof moveDefaultsSchema>("tasksMove", moveDefaultsSchema, {
  mode: "copy",
  stamp: true,
});

// An absent mode or stamp means "use the global default". lookBack repairs to 1 without a climb:
// the reset narrows what gets rolled rather than widening it. automatic repairs to false for the
// same reason: a repaired field turns rolling off, never on, so none of these carry a climb.
export const journalMoveSchema = v.object({
  mode: v.optional(moveModeSchema),
  stamp: v.optional(v.boolean()),
  source: v.optional(v.picklist(["note", "notelets", "both"]), "note"),
  targetHeading: v.optional(v.string(), ""),
  lookBack: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  automatic: v.optional(v.boolean(), false),
});

export type JournalMoveConfig = v.InferOutput<typeof journalMoveSchema>;

export interface EffectiveMove {
  mode: MoveDefaults["mode"];
  stamp: boolean;
  source: JournalMoveConfig["source"];
  targetHeading: string;
  lookBack: number;
  automatic: boolean;
}

export function effectiveMove(journal: JournalMoveConfig, defaults: MoveDefaults): EffectiveMove {
  return {
    mode: journal.mode ?? defaults.mode,
    stamp: journal.stamp ?? defaults.stamp,
    source: journal.source,
    targetHeading: journal.targetHeading,
    lookBack: journal.lookBack,
    automatic: journal.automatic,
  };
}

/** Why automatic rollover cannot run for this setup, or null when it can. */
export function automaticBlocked(move: Pick<EffectiveMove, "mode" | "stamp">): "copy-without-stamp" | null {
  return move.mode === "copy" && !move.stamp ? "copy-without-stamp" : null;
}
