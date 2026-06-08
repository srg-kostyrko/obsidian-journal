<script setup lang="ts">
import { Menu } from "obsidian";
import { match } from "ts-pattern";
import { computed } from "vue";

import { CalendarDate, DayPeriod, MonthPeriod, QuarterPeriod, WeekPeriod, YearPeriod } from "@/calendar";
import type { AnchorString, Period } from "@/calendar";
import { datePickerModal } from "@/calendar/ui/modals";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { defineOpenMode } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { OpenDateFlow } from "@/journals";
import { useShelfScope } from "@/notes-calendar/use-shelf-scope";
import UiButton from "@/ui/UiButton.vue";
import UiIcon from "@/ui/UiIcon.vue";

import { useViewContext } from "../../../view-context";
import { resolveButtonAppearance, type ButtonAction, type ButtonConfig, type ButtonLevel } from "../button-config";

import type { BlockInstanceId } from "../../../config";

const props = defineProps<{
  instanceId: BlockInstanceId;
  config: ButtonConfig;
}>();

const context = useViewContext();
const flows = useService(Flows);
const modals = useService(ModalService);
const scope = useShelfScope(() => context.shelf.value);

const appearance = computed(() => resolveButtonAppearance(props.config.action));
const icon = computed(() => props.config.icon ?? appearance.value.icon);
const label = computed(() => props.config.label ?? appearance.value.label);
const tooltip = computed(() => props.config.tooltip ?? appearance.value.tooltip);

function periodFor(level: ButtonLevel, date: CalendarDate): Period {
  return match(level)
    .with("day", () => DayPeriod.containing(date) as Period)
    .with("week", () => WeekPeriod.containing(date) as Period)
    .with("month", () => MonthPeriod.containing(date) as Period)
    .with("quarter", () => QuarterPeriod.containing(date) as Period)
    .with("year", () => YearPeriod.containing(date) as Period)
    .exhaustive();
}

function journalsFor(level: ButtonLevel): readonly string[] {
  return match(level)
    .with("day", () => scope.day.value)
    .with("week", () => scope.week.value)
    .with("month", () => scope.month.value)
    .with("quarter", () => scope.quarter.value)
    .with("year", () => scope.year.value)
    .exhaustive();
}

async function applyMode(
  mode: "select-only" | "navigate" | "create",
  anchor: AnchorString,
  level: ButtonLevel,
  event: MouseEvent,
): Promise<void> {
  if (mode === "select-only") {
    context.setRefDate(anchor);
    return;
  }
  await flows.invoke(OpenDateFlow, {
    anchor,
    journalNames: [...journalsFor(level)],
    openMode: defineOpenMode(event),
    existingOnly: mode === "navigate",
  });
}

async function fire(level: ButtonLevel, event: MouseEvent): Promise<void> {
  await match(props.config.action)
    .with({ type: "pick-date" }, async (action) => {
      const result = await modals.open(datePickerModal, { picking: level });
      if (result.isErr()) return;
      await applyMode(action.mode, result.value.anchor.toAnchor(), level, event);
    })
    .with({ type: "current" }, async (action) => {
      const period = periodFor(level, CalendarDate.today());
      await applyMode(action.mode, period.anchor.toAnchor(), level, event);
    })
    .with({ type: "navigate-step" }, (action) => {
      const date = CalendarDate.fromAnchor(context.refDate.value);
      let cursor = periodFor(action.unit, date);
      const direction = match(action.direction)
        .with("prev", () => -1)
        .with("next", () => 1)
        .exhaustive();
      const amount = action.amount;
      for (let index = 0; index < amount; index += 1) {
        cursor = direction < 0 ? (cursor as { previous(): Period }).previous() : (cursor as { next(): Period }).next();
      }
      context.setRefDate(cursor.anchor.toAnchor());
    })
    .exhaustive();
}

function menuLabelFor(action: ButtonAction, level: ButtonLevel): string {
  return match(action)
    .with({ type: "pick-date" }, () => m.view_toolbar_button_menu_pick({ unit: level }))
    .with({ type: "current" }, () =>
      match(level)
        .with("day", () => m.common_label_today())
        .with("week", "month", "quarter", "year", (period) => m.relative_date_this({ period }))
        .exhaustive(),
    )
    .otherwise(() => level);
}

function onClick(event: MouseEvent): void {
  const action = props.config.action;
  if (action.type === "navigate-step") {
    void fire("day", event); // navigate-step ignores level
    return;
  }
  if (action.levels.length === 1) {
    void fire(action.levels[0], event);
    return;
  }
  const menu = new Menu();
  for (const level of action.levels) {
    const itemLabel = menuLabelFor(action, level);
    menu.addItem((item) => item.setTitle(itemLabel).onClick(() => void fire(level, event)));
  }
  menu.showAtMouseEvent(event);
}
</script>

<template>
  <UiButton flat :aria-label="tooltip" :title="tooltip" @click="onClick" @auxclick.middle.prevent="onClick">
    <UiIcon v-if="icon" :name="icon" />
    <span v-if="label">{{ label }}</span>
    <span v-else-if="!icon">{{ tooltip }}</span>
  </UiButton>
</template>
