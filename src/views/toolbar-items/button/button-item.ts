import { m } from "@/i18n";
import { icons } from "@/ui/icons";

import { defineToolbarItem } from "../../define-toolbar-item";

import { buttonItemConfigSchema, resolveButtonAppearance, type ButtonConfig } from "./button-config";
import ButtonItem from "./ui/ButtonItem.vue";
import ButtonItemConfig from "./ui/ButtonItemConfig.vue";

export const buttonItem = defineToolbarItem<ButtonConfig>({
  key: "button",
  label: m.view_toolbar_button_label(),
  icon: icons.block.button,
  schema: buttonItemConfigSchema,
  defaultConfig: { action: { type: "current", mode: "create", levels: ["day"] } },
  component: ButtonItem,
  configComponent: ButtonItemConfig,
  summary: (config) => resolveButtonAppearance(config.action).tooltip,
  presets: [
    {
      label: m.view_toolbar_button_preset_pick_date(),
      description: m.view_toolbar_button_preset_pick_date_description(),
      defaultConfig: { action: { type: "pick-date", mode: "navigate", levels: ["day"] } },
    },
    {
      label: m.common_label_today(),
      description: m.view_toolbar_button_preset_today_description(),
      defaultConfig: { action: { type: "current", mode: "create", levels: ["day"] } },
    },
    {
      label: m.view_toolbar_button_preset_navigate(),
      description: m.view_toolbar_button_preset_navigate_description(),
      defaultConfig: {
        action: { type: "navigate-step", direction: "next", unit: "month", amount: 1 },
      },
    },
  ],
});
