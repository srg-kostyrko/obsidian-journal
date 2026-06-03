<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate, MonthPeriod, QuarterPeriod, WeekPeriod, YearPeriod } from "@/calendar";
import type { Period } from "@/calendar";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { defineOpenMode } from "@/infrastructure/host";
import { OpenDateFlow } from "@/journals";
import { ActiveEntryViewModel } from "@/notes-calendar/active-entry";
import { useShelfScope } from "@/notes-calendar/use-shelf-scope";
import UiButton from "@/ui/UiButton.vue";

import { useViewContext } from "../../../view-context";

import type { BlockInstanceId } from "../../../config";
import type { PeriodButtonsConfig } from "../period-buttons-item";

type PeriodKey = "week" | "month" | "quarter" | "year";

interface Badge {
  readonly key: PeriodKey;
  readonly period: Period;
  readonly journals: readonly string[];
  readonly label: string;
}

const props = defineProps<{
  instanceId: BlockInstanceId;
  config: PeriodButtonsConfig;
}>();

const context = useViewContext();
const flows = useService(Flows);
const activeVM = useService(ActiveEntryViewModel);
const scope = useShelfScope(() => context.shelf.value);

const badges = computed<readonly Badge[]>(() => {
  const date = CalendarDate.fromAnchor(context.refDate.value);
  const out: Badge[] = [];
  const add = (key: PeriodKey, period: Period, journals: readonly string[], format: string): void => {
    if (!props.config[key]) return;
    if (journals.length === 0) return;
    out.push({ key, period, journals, label: period.format(format) });
  };
  add("week", WeekPeriod.containing(date), scope.week.value, "[W]ww YYYY");
  add("month", MonthPeriod.containing(date), scope.month.value, "MMM YYYY");
  add("quarter", QuarterPeriod.containing(date), scope.quarter.value, "[Q]Q YYYY");
  add("year", YearPeriod.containing(date), scope.year.value, "YYYY");
  return out;
});

function isActive(badge: Badge): boolean {
  const active = activeVM.active.value;
  if (active === null) return false;
  if (!badge.journals.includes(active.journalName)) return false;
  return active.anchor === badge.period.anchor.toAnchor();
}

function open(badge: Badge, event: MouseEvent): void {
  void flows.invoke(OpenDateFlow, {
    anchor: badge.period.anchor.toAnchor(),
    journalNames: [...badge.journals],
    openMode: defineOpenMode(event),
  });
}
</script>

<template>
  <UiButton
    v-for="badge of badges"
    :key="badge.key"
    flat
    :data-period="badge.key"
    :data-active="isActive(badge) || null"
    @click="(event: MouseEvent) => open(badge, event)"
    @auxclick.middle.prevent="(event: MouseEvent) => open(badge, event)"
  >
    {{ badge.label }}
  </UiButton>
</template>
