<script setup lang="ts">
import { match } from "ts-pattern";
import { computed } from "vue";

import { Clock, type AnchorString } from "@/calendar";
import { useService } from "@/infrastructure/di";
import type { CodeBlockProps } from "@/infrastructure/host";
import { JournalsIndex, JournalsRepository } from "@/journals";
import { ShelvesRepository } from "@/shelves";

import TimelineCalendar from "./TimelineCalendar.vue";
import TimelineMonth from "./TimelineMonth.vue";
import TimelineQuarter from "./TimelineQuarter.vue";
import TimelineWeek from "./TimelineWeek.vue";

import type { TimelineBlockConfig, TimelineMode } from "../timeline-config";

const { path, config } = defineProps<CodeBlockProps<TimelineBlockConfig>>();

const journals = useService(JournalsRepository);
const index = useService(JournalsIndex);
const shelves = useService(ShelvesRepository);

const entry = computed(() => index.entryByPath(path));

const journal = computed(() =>
  entry.value
    .flatMap((hostEntry) => journals.get(hostEntry.journalName))
    .match({
      some: (journalConfig) => journalConfig,
      none: () => null,
    }),
);

const refDate = computed<AnchorString>(() =>
  entry.value.match({
    some: (hostEntry) => hostEntry.anchor,
    none: () => Clock.now().format("YYYY-MM-DD") as AnchorString,
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
  const owning = [...shelves.find().list()].find((shelf) => shelf.journals.includes(hostJournal.name));
  return owning?.name ?? null;
});

const shelf = computed(() => config.shelf ?? derivedShelf.value);
</script>

<template>
  <TimelineWeek
    v-if="mode === 'week'"
    :ref-date="refDate"
    :shelf="shelf"
    :weeks="config.weeks"
    :hidden-weekdays="config.hiddenWeekdays"
  />
  <TimelineMonth
    v-else-if="mode === 'month'"
    :ref-date="refDate"
    :shelf="shelf"
    :weeks="config.weeks"
    :hidden-weekdays="config.hiddenWeekdays"
  />
  <TimelineQuarter
    v-else-if="mode === 'quarter'"
    :ref-date="refDate"
    :shelf="shelf"
    :weeks="config.weeks"
    :hidden-weekdays="config.hiddenWeekdays"
  />
  <TimelineCalendar
    v-else
    :ref-date="refDate"
    :shelf="shelf"
    :weeks="config.weeks"
    :hidden-weekdays="config.hiddenWeekdays"
  />
</template>
