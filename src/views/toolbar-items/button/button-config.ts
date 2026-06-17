import { match, P } from "ts-pattern";
import * as v from "valibot";

import { m } from "@/i18n";
import { icons } from "@/ui/icons";

const levelField = v.picklist(["day", "week", "month", "quarter", "year"] as const);
const levelsField = v.pipe(v.array(levelField), v.minLength(1));
const modeField = v.picklist(["select-only", "navigate", "create"] as const);
const unitField = v.picklist(["day", "week", "month", "quarter", "year"] as const);

export const buttonActionSchema = v.variant("type", [
  v.object({ type: v.literal("pick-date"), mode: modeField, levels: levelsField }),
  v.object({ type: v.literal("current"), mode: modeField, levels: levelsField }),
  v.object({
    type: v.literal("navigate-step"),
    direction: v.picklist(["prev", "next"] as const),
    unit: unitField,
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

export interface ButtonAppearance {
  readonly icon?: string;
  readonly label?: string;
  readonly tooltip: string;
}

export function resolveButtonAppearance(action: ButtonAction): ButtonAppearance {
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
