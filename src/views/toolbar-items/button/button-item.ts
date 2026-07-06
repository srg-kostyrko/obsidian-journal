import { m } from "@/i18n";
import { icons } from "@/ui/icons";

import { defineToolbarItem } from "../../define-toolbar-item";

import { buttonItemConfigSchema, resolveButtonAppearance, type ButtonConfig } from "./button-config";
import ButtonItem from "./ui/ButtonItem.vue";
import ButtonItemConfig from "./ui/ButtonItemConfig.vue";

export const buttonItem = defineToolbarItem<ButtonConfig>({
  key: "button",
  label: m.view_toolbar_button_label(),
  description: m.view_toolbar_button_description(),
  icon: icons.block.button,
  schema: buttonItemConfigSchema,
  defaultConfig: { action: { type: "current", mode: "create", levels: ["day"] } },
  component: ButtonItem,
  configComponent: ButtonItemConfig,
  summary: (config) => resolveButtonAppearance(config.action).tooltip,
  presets: [
    {
      label: m.view_toolbar_button_preset_pick_date(),
      defaultConfig: { action: { type: "pick-date", mode: "navigate", levels: ["day"] } },
    },
    {
      label: m.common_label_today(),
      defaultConfig: { action: { type: "current", mode: "create", levels: ["day"] } },
    },
    {
      label: m.view_toolbar_button_preset_navigate(),
      defaultConfig: {
        action: { type: "navigate-step", direction: "next", unit: "month", amount: 1 },
      },
    },
  ],
});
