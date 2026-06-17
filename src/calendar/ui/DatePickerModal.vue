<script setup lang="ts">
import { match } from "ts-pattern";
import { computed, ref, toRaw } from "vue";

import { CalendarDate, DecadePeriod, MonthPeriod, type OpenInterval, type Period, YearPeriod } from "@/calendar";
import { useModal } from "@/infrastructure/host/modals";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiIconButton from "@/ui/UiIconButton.vue";

import CalendarDecadeView from "./CalendarDecadeView.vue";
import CalendarMonthView from "./CalendarMonthView.vue";
import CalendarQuarterView from "./CalendarQuarterView.vue";
import CalendarWeekView from "./CalendarWeekView.vue";
import CalendarYearView from "./CalendarYearView.vue";
import { descend } from "./descend";

import type { Picking, View } from "./errors";

const props = defineProps<{
  picking: Picking;
  bounds?: OpenInterval;
  selected?: Period | null;
}>();

const api = useModal<Period>();

function targetView(picking: Picking): View {
  return match(picking)
    .with("day", () => "month" as const)
    .with("week", () => "week" as const)
    .with("month", () => "year" as const)
    .with("quarter", () => "quarter" as const)
    .with("year", () => "decade" as const)
    .exhaustive();
}

function ascend(view: View): View | null {
  return match(view)
    .with("month", () => "year" as const)
    .with("week", () => "year" as const)
    .with("year", () => "decade" as const)
    .with("quarter", () => "decade" as const)
    .with("decade", () => null)
    .exhaustive();
}

function outerPeriod(view: View, refDate: CalendarDate): Period {
  return match(view)
    .with("month", () => MonthPeriod.containing(refDate))
    .with("week", () => MonthPeriod.containing(refDate))
    .with("year", () => YearPeriod.containing(refDate))
    .with("quarter", () => YearPeriod.containing(refDate))
    .with("decade", () => DecadePeriod.containing(refDate))
    .exhaustive();
}

const selectedForHighlight = computed<Period | null>(() => {
  const s = props.selected ?? null;
  if (!s) return null;
  return s.kind === props.picking ? s : null;
});

const refDate = ref<CalendarDate>(toRaw(props.selected)?.anchor ?? CalendarDate.today());
const currentView = ref<View>(targetView(props.picking));

const outer = computed<Period>(() => outerPeriod(currentView.value, toRaw(refDate.value)));

const outerAsMonth = computed<MonthPeriod>(() => outer.value as MonthPeriod);
const outerAsYear = computed<YearPeriod>(() => outer.value as YearPeriod);
const outerAsDecade = computed<DecadePeriod>(() => outer.value as DecadePeriod);

const titleLabel = computed<string>(() => {
  return match(currentView.value)
    .with("month", () => outer.value.format("MMMM YYYY"))
    .with("week", () => outer.value.format("MMMM YYYY"))
    .with("year", () => outer.value.format("YYYY"))
    .with("quarter", () => outer.value.format("YYYY"))
    .with("decade", () => {
      const decade = outer.value as DecadePeriod;
      return `${decade.start.format("YYYY")} – ${decade.end.format("YYYY")}`;
    })
    .exhaustive();
});

const canAscend = computed<View | null>(() => ascend(currentView.value));

function onTitleClick(): void {
  const next = ascend(currentView.value);
  if (next) currentView.value = next;
}

const canPrevious = computed(() => {
  const previous = (toRaw(outer.value) as { previous(): Period }).previous();
  const bounds = toRaw(props.bounds);
  return !bounds || bounds.overlapsPeriod(previous);
});

const canNext = computed(() => {
  const next = (toRaw(outer.value) as { next(): Period }).next();
  const bounds = toRaw(props.bounds);
  return !bounds || bounds.overlapsPeriod(next);
});

function onPrevious(): void {
  refDate.value = (toRaw(outer.value) as { previous(): Period }).previous().anchor;
}

function onNext(): void {
  refDate.value = (toRaw(outer.value) as { next(): Period }).next().anchor;
}

function onCellSelect(cell: Period): void {
  if (currentView.value === targetView(props.picking)) {
    api.submit(cell);
  } else {
    const { nextView, nextRef } = descend(currentView.value, props.picking, cell);
    currentView.value = nextView;
    refDate.value = nextRef;
  }
}
</script>

<template>
  <div class="date-picker-modal">
    <div class="date-picker-modal__header">
      <UiIconButton v-if="canPrevious" :icon="icons.nav.prev" data-testid="modal-prev" @click="onPrevious" />
      <UiButton
        v-if="canAscend !== null"
        flat
        class="date-picker-modal__title-button"
        data-testid="modal-title-button"
        @click="onTitleClick"
      >
        <span data-testid="modal-title-label">{{ titleLabel }}</span>
      </UiButton>
      <span v-else data-testid="modal-title-label">{{ titleLabel }}</span>
      <UiIconButton v-if="canNext" :icon="icons.nav.next" data-testid="modal-next" @click="onNext" />
    </div>
    <div class="date-picker-modal__body">
      <CalendarMonthView
        v-if="currentView === 'month'"
        :outer-period="outerAsMonth"
        :selected="selectedForHighlight"
        :bounds="bounds"
        @select="onCellSelect"
      />
      <CalendarWeekView
        v-else-if="currentView === 'week'"
        :outer-period="outerAsMonth"
        :selected="selectedForHighlight"
        :bounds="bounds"
        @select="onCellSelect"
      />
      <CalendarQuarterView
        v-else-if="currentView === 'quarter'"
        :outer-period="outerAsYear"
        :selected="selectedForHighlight"
        :bounds="bounds"
        @select="onCellSelect"
      />
      <CalendarYearView
        v-else-if="currentView === 'year'"
        :outer-period="outerAsYear"
        :selected="selectedForHighlight"
        :bounds="bounds"
        @select="onCellSelect"
      />
      <CalendarDecadeView
        v-else
        :outer-period="outerAsDecade"
        :selected="selectedForHighlight"
        :bounds="bounds"
        @select="onCellSelect"
      />
    </div>
  </div>
</template>

<style scoped>
.date-picker-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.date-picker-modal__title-button {
  width: auto;
}
</style>
