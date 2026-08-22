<script setup lang="ts">
import { match } from "ts-pattern";
import { computed, ref, watch } from "vue";

import {
  CalendarDate,
  advance,
  periodOfKind,
  window as periodWindow,
  useResolvedTimelineNavigation,
  useResolvedWeekPlacement,
  type AnchorString,
  type Period,
  type PeriodKind,
} from "@/calendar";
import { useToday } from "@/calendar/ui";
import { useService } from "@/infrastructure/di";
import type { CodeBlockProps } from "@/infrastructure/host";
import { JournalsIndex, JournalsRepository, useIndexVersion } from "@/journals";
import { ShelvesRepository } from "@/shelves";

import TimelineCalendar from "./TimelineCalendar.vue";
import TimelineMonth from "./TimelineMonth.vue";
import TimelineNavigation from "./TimelineNavigation.vue";
import TimelineQuarter from "./TimelineQuarter.vue";
import TimelineWeek from "./TimelineWeek.vue";

import type { TimelineBlockConfig, TimelineMode } from "../timeline-config";

const { path, config } = defineProps<CodeBlockProps<TimelineBlockConfig>>();

const journals = useService(JournalsRepository);
const index = useService(JournalsIndex);
const shelves = useService(ShelvesRepository);

const indexVersion = useIndexVersion();

const entry = computed(() => {
  void indexVersion.value;
  return index.entryByPath(path);
});

const journal = computed(() =>
  entry.value
    .flatMap((hostEntry) => journals.get(hostEntry.journalName))
    .match({
      some: (journalConfig) => journalConfig,
      none: () => null,
    }),
);

const today = useToday();
const hostDate = computed<AnchorString>(() =>
  entry.value.match({
    some: (hostEntry) => hostEntry.anchor,
    none: () => today.value.toAnchor(),
  }),
);

const derivedMode = computed<TimelineMode>(() => {
  const hostJournal = journal.value;
  if (!hostJournal) return "week";
  return match(hostJournal.write.type)
    .with("day", "week", () => "week" as const)
    .with("month", () => "month" as const)
    .with("quarter", () => "quarter" as const)
    .with("year", () => "calendar" as const)
    .with("custom", () => "week" as const)
    .exhaustive();
});

const mode = computed(() => config.mode ?? derivedMode.value);

const derivedShelf = computed(() => {
  const hostJournal = journal.value;
  if (!hostJournal) return null;
  return shelves
    .find()
    .filter((shelf) => shelf.journals.includes(hostJournal.name))
    .first()
    .match<string | null>({ some: (shelf) => shelf.name, none: () => null });
});

const shelf = computed(() => config.shelf ?? derivedShelf.value);

const weekPlacement = useResolvedWeekPlacement(() => config.weeks);
const navigation = useResolvedTimelineNavigation(() => config.navigation);

// The period one arrow press moves by, which is the one the mode is built around.
const unit = computed<Exclude<PeriodKind, "day" | "decade">>(() =>
  match(mode.value)
    .with("week", () => "week" as const)
    .with("month", () => "month" as const)
    .with("quarter", () => "quarter" as const)
    .with("calendar", () => "year" as const)
    .exhaustive(),
);

// How many `unit` periods away from the host note the block is currently showing. Local to
// the mount by design: Obsidian rebuilds a code block on its own schedule, and a window that
// outlived its note's period would be stranded with no way back.
const offset = ref(0);
watch(hostDate, () => {
  offset.value = 0;
});

const focus = computed<Period>(() => {
  const hostPeriod = periodOfKind(unit.value, CalendarDate.fromAnchor(hostDate.value));
  // Reading the offset only while the row is shown keeps a paged window from being stranded
  // when navigation is switched off, without a watcher to clear it.
  return navigation.value ? advance(hostPeriod, offset.value) : hostPeriod;
});

const refDate = computed<AnchorString>(() => focus.value.anchor.toAnchor());

// Padding applies to the week and month modes only, so every other mode shows one period and
// the row names that one rather than a range.
const padded = computed(() => mode.value === "week" || mode.value === "month");
const visiblePeriods = computed<readonly Period[]>(() =>
  padded.value ? periodWindow(focus.value, config.before ?? 0, config.after ?? 0) : [focus.value],
);

function step(steps: number): void {
  offset.value += steps;
}
</script>

<template>
  <div class="journal-timeline" :data-mode="mode">
    <TimelineNavigation
      v-if="navigation"
      :periods="visiblePeriods"
      :unit="unit"
      :moved="offset !== 0"
      @step="step"
      @reset="offset = 0"
    />
    <!-- Only the week and month modes take padding; quarter and calendar never receive it,
         so a `before`/`after` set under them is inert by construction. -->
    <TimelineWeek
      v-if="mode === 'week'"
      :ref-date="refDate"
      :shelf="shelf"
      :weeks="weekPlacement"
      :hidden-weekdays="config.hiddenWeekdays"
      :before="config.before"
      :after="config.after"
    />
    <TimelineMonth
      v-else-if="mode === 'month'"
      :ref-date="refDate"
      :shelf="shelf"
      :weeks="weekPlacement"
      :hidden-weekdays="config.hiddenWeekdays"
      :before="config.before"
      :after="config.after"
    />
    <TimelineQuarter
      v-else-if="mode === 'quarter'"
      :ref-date="refDate"
      :shelf="shelf"
      :weeks="weekPlacement"
      :hidden-weekdays="config.hiddenWeekdays"
    />
    <TimelineCalendar
      v-else
      :ref-date="refDate"
      :shelf="shelf"
      :weeks="weekPlacement"
      :hidden-weekdays="config.hiddenWeekdays"
    />
  </div>
</template>

<style scoped>
/* The grids' width lives here rather than in each mode component: the navigation row has to
   match whatever the grids below it are, and week/month centre a fixed strip while quarter
   and calendar fill the note. */
.journal-timeline {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--size-4-2);
  --timeline-content: 100%;
}
.journal-timeline[data-mode="week"],
.journal-timeline[data-mode="month"] {
  --timeline-content: 400px;
}
.journal-timeline > * {
  width: var(--timeline-content);
  max-width: 100%;
}
</style>
