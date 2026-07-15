<script setup lang="ts">
import { Menu } from "obsidian";
import { match } from "ts-pattern";
import { computed } from "vue";

import { advance, CalendarDate, periodOfKind } from "@/calendar";
import type { AnchorString } from "@/calendar";
import { datePickerModal } from "@/calendar/ui/modals";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { defineOpenMode } from "@/infrastructure/host";
import { ModalService } from "@/infrastructure/host/modals";
import { CycleService, OpenDateFlow } from "@/journals";
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
const cycle = useService(CycleService);
const scope = useShelfScope(() => context.shelf.value);

const appearance = computed(() => resolveButtonAppearance(props.config.action));
const icon = computed(() => props.config.icon ?? appearance.value.icon);
const label = computed(() => props.config.label ?? appearance.value.label);
const tooltip = computed(() => props.config.tooltip ?? appearance.value.tooltip);

function periodFor(level: ButtonLevel, date: CalendarDate) {
  return periodOfKind(level, date);
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
  journalNames: readonly string[],
  event: MouseEvent,
): Promise<void> {
  // v2 parity: the pick/today interaction always moves the displayed period to the
  // chosen date; the mode only decides whether an open follows. Without this, a
  // navigate-mode pick of a note-less date would be a complete no-op.
  context.setRefDate(anchor);
  if (mode === "select-only") return;
  await flows.invoke(OpenDateFlow, {
    anchor,
    journalNames: [...journalNames],
    openMode: defineOpenMode(event),
    existingOnly: mode === "navigate",
  });
}

async function fire(level: ButtonLevel, event: MouseEvent): Promise<void> {
  await match(props.config.action)
    .with({ type: "pick-date" }, async (action) => {
      // Open the picker on the period the calendar currently shows, pre-selected (v2 parity).
      const displayed = periodFor(level, CalendarDate.fromAnchor(context.refDate.value));
      const result = await modals.open(datePickerModal, { picking: level, selected: displayed });
      if (result.isErr()) return;
      await applyMode(action.mode, result.value.anchor.toAnchor(), journalsFor(level), event);
    })
    .with({ type: "current" }, async (action) => {
      const period = periodFor(level, CalendarDate.today());
      await applyMode(action.mode, period.anchor.toAnchor(), journalsFor(level), event);
    })
    .with({ type: "navigate-step" }, (action) => {
      const date = CalendarDate.fromAnchor(context.refDate.value);
      const direction = match(action.direction)
        .with("prev", () => -1)
        .with("next", () => 1)
        .exhaustive();
      const cursor = advance(periodFor(action.unit, date), direction * action.amount);
      context.setRefDate(cursor.anchor.toAnchor());
    })
    .exhaustive();
}

async function fireJournal(
  action: Extract<ButtonAction, { type: "current" | "pick-date" }>,
  event: MouseEvent,
): Promise<void> {
  const journal = action.journal;
  if (!journal) return;
  let date: CalendarDate;
  if (action.type === "pick-date") {
    const displayed = periodFor("day", CalendarDate.fromAnchor(context.refDate.value));
    const result = await modals.open(datePickerModal, { picking: "day", selected: displayed });
    if (result.isErr()) return;
    date = CalendarDate.fromAnchor(result.value.anchor.toAnchor());
  } else {
    date = CalendarDate.today();
  }
  const anchor = cycle.anchorOf(journal, date);
  if (anchor.isNone()) return;
  await applyMode(action.mode, anchor.value, [journal], event);
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
  if (action.journal) {
    void fireJournal(action, event);
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
  <UiButton flat :tooltip="tooltip" @click="onClick" @auxclick.middle.prevent="onClick">
    <UiIcon v-if="icon" :name="icon" />
    <span v-if="label">{{ label }}</span>
    <span v-else-if="!icon">{{ tooltip }}</span>
  </UiButton>
</template>
