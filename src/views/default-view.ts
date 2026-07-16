import { m } from "@/i18n";
import { icons } from "@/ui/icons";

import type { BlockInstanceId, View, ViewId } from "./config";

export const DEFAULT_CALENDAR_VIEW_ID = "b9f3a1c2-0d4e-4f6a-8b1c-2d3e4f5a6b7c" as ViewId;

const TOOLBAR_ACTIONS_BLOCK_ID = "c1a2b3d4-1e2f-4a5b-9c6d-7e8f9a0b1c2d" as BlockInstanceId;
const TOOLBAR_NAV_BLOCK_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d" as BlockInstanceId;
const MONTH_CALENDAR_BLOCK_ID = "fa0d1e2b-0b1c-4d4e-8f5a-7b8c9d0e1f2a" as BlockInstanceId;
const DIVIDER_BLOCK_ID = "ab1e2f3c-1c2d-4e5f-9a6b-8c9d0e1f2a3b" as BlockInstanceId;
const CUSTOM_INTERVALS_BLOCK_ID = "bc2f3a4d-2d3e-4f6a-8b7c-9d0e1f2a3b4c" as BlockInstanceId;

const ITEM_SHELF_SELECTOR = "d2b3c4e5-2f3a-4b6c-8d7e-9f0a1b2c3d4e";
const ITEM_SPACER_ACTIONS = "1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e";
const ITEM_PICK_DATE = "e3c4d5f6-3a4b-4c7d-9e8f-0a1b2c3d4e5f";
const ITEM_CURRENT = "f4d5e6a7-4b5c-4d8e-8f9a-1b2c3d4e5f6a";
const ITEM_PREV_YEAR = "a5e6f7b8-5c6d-4e9f-9a0b-2c3d4e5f6a7b";
const ITEM_PREV_MONTH = "b6f7a8c9-6d7e-4f0a-8b1c-3d4e5f6a7b8c";
const ITEM_SPACER_NAV_LEFT = "2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f";
const ITEM_PERIOD_BUTTONS = "c7a8b9d0-7e8f-4a1b-9c2d-4e5f6a7b8c9d";
const ITEM_SPACER_NAV_RIGHT = "3d4e5f6a-7b8c-4d9e-8f0a-2b3c4d5e6f7a";
const ITEM_NEXT_MONTH = "d8b9c0e1-8f9a-4b2c-8d3e-5f6a7b8c9d0e";
const ITEM_NEXT_YEAR = "e9c0d1f2-9a0b-4c3d-9e4f-6a7b8c9d0e1f";

export function defaultCalendarView(): View {
  return {
    id: DEFAULT_CALENDAR_VIEW_ID,
    name: m.common_label_calendar(),
    icon: icons.entity.month,
    defaultShelf: null,
    showInRibbon: true,
    leaf: "right",
    openOnStartup: true,
    rememberDate: false,
    blocks: [
      {
        id: TOOLBAR_ACTIONS_BLOCK_ID,
        key: "toolbar",
        config: {
          items: [
            { id: ITEM_SHELF_SELECTOR, key: "shelf-selector", config: {} },
            { id: ITEM_SPACER_ACTIONS, key: "spacer", config: {} },
            {
              id: ITEM_PICK_DATE,
              key: "button",
              config: { action: { type: "pick-date", mode: "create", levels: ["day"] } },
            },
            {
              id: ITEM_CURRENT,
              key: "button",
              config: { action: { type: "current", mode: "navigate", levels: ["day"] } },
            },
          ],
        },
      },
      {
        id: TOOLBAR_NAV_BLOCK_ID,
        key: "toolbar",
        config: {
          items: [
            {
              id: ITEM_PREV_YEAR,
              key: "button",
              config: { action: { type: "navigate-step", direction: "prev", unit: "year", amount: 1 } },
            },
            {
              id: ITEM_PREV_MONTH,
              key: "button",
              config: { action: { type: "navigate-step", direction: "prev", unit: "month", amount: 1 } },
            },
            { id: ITEM_SPACER_NAV_LEFT, key: "spacer", config: {} },
            {
              id: ITEM_PERIOD_BUTTONS,
              key: "period-buttons",
              config: { week: false, month: true, quarter: true, year: true },
            },
            { id: ITEM_SPACER_NAV_RIGHT, key: "spacer", config: {} },
            {
              id: ITEM_NEXT_MONTH,
              key: "button",
              config: { action: { type: "navigate-step", direction: "next", unit: "month", amount: 1 } },
            },
            {
              id: ITEM_NEXT_YEAR,
              key: "button",
              config: { action: { type: "navigate-step", direction: "next", unit: "year", amount: 1 } },
            },
          ],
        },
      },
      {
        id: MONTH_CALENDAR_BLOCK_ID,
        key: "month-calendar",
        config: { before: 0, after: 0, hiddenWeekdays: [], weeks: "default", showHeading: false },
      },
      { id: DIVIDER_BLOCK_ID, key: "divider", config: {} },
      { id: CUSTOM_INTERVALS_BLOCK_ID, key: "custom-intervals", config: { window: "current-month", hideEmpty: true } },
    ],
  };
}
