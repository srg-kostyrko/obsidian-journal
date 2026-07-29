import { m } from "@/i18n";
import { icons } from "@/ui/icons";

import { defineToolbarItem } from "../../define-toolbar-item";

import { buttonConfigFor, buttonItemConfigSchema, resolveButtonAppearance, type ButtonConfig } from "./button-config";
import ButtonItem from "./ui/ButtonItem.vue";
import ButtonItemConfig from "./ui/ButtonItemConfig.vue";

export const buttonItem = defineToolbarItem<ButtonConfig>({
  key: "button",
  label: m.view_toolbar_button_label(),
  icon: icons.block.button,
  schema: buttonItemConfigSchema,
  defaultConfig: buttonConfigFor({ type: "current", mode: "create", levels: ["day"] }),
  component: ButtonItem,
  configComponent: ButtonItemConfig,
  summary: (config) => resolveButtonAppearance(config.action).tooltip,
  presets: [
    {
      label: m.view_toolbar_button_preset_pick_date(),
      description: m.view_toolbar_button_preset_pick_date_description(),
      defaultConfig: buttonConfigFor({ type: "pick-date", mode: "navigate", levels: ["day"] }),
    },
    {
      label: m.view_toolbar_button_preset_open_note(),
      description: m.view_toolbar_button_preset_open_note_description(),
      defaultConfig: buttonConfigFor({ type: "current", mode: "create", levels: ["day"] }),
    },
    {
      label: m.view_toolbar_button_preset_navigate(),
      description: m.view_toolbar_button_preset_navigate_description(),
      defaultConfig: buttonConfigFor({ type: "navigate-step", direction: "next", unit: "month", amount: 1 }),
    },
  ],
});
