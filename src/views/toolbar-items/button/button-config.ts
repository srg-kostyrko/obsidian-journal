import { match, P } from "ts-pattern";
import * as v from "valibot";

import { m } from "@/i18n";
import { climb } from "@/settings/repair";
import { icons } from "@/ui/icons";

import type { ToolbarItemAppearance } from "../appearance";

const otherAction = "a default makes it a different action";

const levelField = v.picklist(["day", "week", "month", "quarter", "year"] as const);
// Not `climb`, which would lose the whole action for one bad level. The empty default never
// parses, so an absent list still climbs to the action.
const levelsField = v.optional(v.pipe(v.array(levelField), v.minLength(1)), () => []);
const modeField = v.pipe(v.picklist(["select-only", "navigate", "create"] as const), climb(otherAction));
const stepUnitField = v.pipe(v.picklist(["day", "week", "month", "quarter", "year"] as const), climb(otherAction));

export const buttonActionSchema = v.variant("type", [
  v.object({
    type: v.pipe(v.literal("pick-date"), climb("discriminant")),
    mode: modeField,
    levels: levelsField,
    journal: v.optional(v.string()),
  }),
  v.object({
    type: v.pipe(v.literal("current"), climb("discriminant")),
    mode: modeField,
    levels: levelsField,
    journal: v.optional(v.string()),
  }),
  v.object({
    type: v.pipe(v.literal("navigate-step"), climb("discriminant")),
    direction: v.pipe(v.picklist(["prev", "next"] as const), climb(otherAction)),
    unit: stepUnitField,
    amount: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  }),
]);

export const buttonItemConfigSchema = v.object({
  action: buttonActionSchema,
  icon: v.optional(v.string()),
  label: v.optional(v.string()),
  tooltip: v.optional(v.string()),
});

export type ButtonAction = v.InferOutput<typeof buttonActionSchema>;
export type ButtonConfig = v.InferOutput<typeof buttonItemConfigSchema>;
export type ButtonConfigChange = (next: ButtonConfig) => void;
export type ButtonLevel = "day" | "week" | "month" | "quarter" | "year";
export type ButtonStepUnit = "day" | "week" | "month" | "quarter" | "year";

export function resolveButtonAppearance(action: ButtonAction): ToolbarItemAppearance {
  return match(action)
    .with({ type: "pick-date", levels: P.when((l) => l.length === 1 && l[0] === "day") }, () => ({
      icon: icons.action.pickDate,
      tooltip: m.common_pick_a_date(),
    }))
    .with({ type: "pick-date" }, () => ({
      icon: icons.action.pickDate,
      tooltip: m.view_toolbar_button_default_tooltip_pick_multi(),
    }))
    .with({ type: "current", levels: P.when((l) => l.length === 1 && l[0] === "day") }, () => ({
      label: m.common_label_today(),
      tooltip: m.common_label_today(),
    }))
    .with({ type: "current", levels: P.when((l) => l.length === 1 && l[0] === "week") }, () => ({
      label: m.relative_date_this({ period: "week" }),
      tooltip: m.relative_date_this({ period: "week" }),
    }))
    .with({ type: "current", levels: P.when((l) => l.length === 1 && l[0] === "month") }, () => ({
      label: m.relative_date_this({ period: "month" }),
      tooltip: m.relative_date_this({ period: "month" }),
    }))
    .with({ type: "current", levels: P.when((l) => l.length === 1 && l[0] === "quarter") }, () => ({
      label: m.relative_date_this({ period: "quarter" }),
      tooltip: m.relative_date_this({ period: "quarter" }),
    }))
    .with({ type: "current", levels: P.when((l) => l.length === 1 && l[0] === "year") }, () => ({
      label: m.relative_date_this({ period: "year" }),
      tooltip: m.relative_date_this({ period: "year" }),
    }))
    .with({ type: "current" }, () => ({
      label: m.view_toolbar_button_default_label_current(),
      tooltip: m.view_toolbar_button_default_tooltip_current_multi(),
    }))
    .with({ type: "navigate-step", direction: "prev", unit: P.union("day", "week", "month") }, ({ unit }) => ({
      icon: icons.nav.prev,
      tooltip: m.view_toolbar_button_default_tooltip_prev_unit({ unit }),
    }))
    .with({ type: "navigate-step", direction: "prev", unit: P.union("quarter", "year") }, ({ unit }) => ({
      icon: icons.nav.prevLeap,
      tooltip: m.view_toolbar_button_default_tooltip_prev_unit({ unit }),
    }))
    .with({ type: "navigate-step", direction: "next", unit: P.union("day", "week", "month") }, ({ unit }) => ({
      icon: icons.nav.next,
      tooltip: m.view_toolbar_button_default_tooltip_next_unit({ unit }),
    }))
    .with({ type: "navigate-step", direction: "next", unit: P.union("quarter", "year") }, ({ unit }) => ({
      icon: icons.nav.nextLeap,
      tooltip: m.view_toolbar_button_default_tooltip_next_unit({ unit }),
    }))
    .exhaustive();
}

export function buttonConfigFor(action: ButtonAction): ButtonConfig {
  return { action, ...resolveButtonAppearance(action) };
}
