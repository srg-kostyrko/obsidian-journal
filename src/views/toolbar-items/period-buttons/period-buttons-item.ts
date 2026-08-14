import * as v from "valibot";

import { m } from "@/i18n";
import { icons } from "@/ui/icons";

import { defineToolbarItem } from "../../define-toolbar-item";

import PeriodButtonsItem from "./ui/PeriodButtonsItem.vue";
import PeriodButtonsItemConfig from "./ui/PeriodButtonsItemConfig.vue";

const schema = v.object({
  week: v.boolean(),
  month: v.boolean(),
  quarter: v.boolean(),
  year: v.boolean(),
});

export type PeriodButtonsConfig = v.InferOutput<typeof schema>;
export type PeriodButtonsConfigChange = (next: PeriodButtonsConfig) => void;

export const periodButtonsItem = defineToolbarItem<PeriodButtonsConfig>({
  key: "period-buttons",
  label: () => m.view_toolbar_period_buttons_label(),
  description: () => m.view_toolbar_period_buttons_description(),
  icon: icons.entity.week,
  schema,
  defaultConfig: () => ({ week: false, month: true, quarter: true, year: true }),
  component: PeriodButtonsItem,
  configComponent: PeriodButtonsItemConfig,
});
