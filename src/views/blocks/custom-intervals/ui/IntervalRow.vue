<script setup lang="ts">
import { computed } from "vue";

import type { AnchorString } from "@/calendar";
import { useToday } from "@/calendar/ui";
import { navBlockDecorationScope } from "@/code-blocks/nav/decoration-scopes";
import { periodForJournal } from "@/code-blocks/nav/period-for-journal";
import NavBlock from "@/code-blocks/nav/ui/NavBlock.vue";
import { useService } from "@/infrastructure/di";
import { CycleService, useIndexVersion } from "@/journals";
import type { JournalConfig } from "@/journals";
import { ActiveEntryViewModel } from "@/notes-calendar/active-entry";
import { entryCoversDate } from "@/notes-calendar/entry-coverage";

import { useViewContext } from "../../../view-context";

const props = defineProps<{
  journal: JournalConfig;
  anchor: AnchorString;
  shelf: string | null;
}>();

const activeEntry = useService(ActiveEntryViewModel);
const cycle = useService(CycleService);
const context = useViewContext();
const today = useToday();
const indexVersion = useIndexVersion();

const isActive = computed(() => {
  const current = activeEntry.active.value;
  return current !== null && current.journalName === props.journal.name && current.anchor === props.anchor;
});

// A stored extended end date lives in the index, which is not Vue-reactive.
function covers(date: AnchorString): boolean {
  void indexVersion.value;
  return entryCoversDate(cycle, { journalName: props.journal.name, anchor: props.anchor }, date);
}

const isToday = computed(() => covers(today.value.toAnchor()));
const isSelected = computed(() => covers(context.refDate.value));
const states = computed(() =>
  (
    [
      ["today", isToday.value],
      ["selected", isSelected.value],
      ["active", isActive.value],
    ] as const
  )
    .filter(([, applies]) => applies)
    .map(([state]) => state),
);
// The open note's fill replaces today's; today's ring stays.
const fills = computed(() => states.value.filter((state) => state !== "today" || !isActive.value));
</script>

<template>
  <div
    class="journal-view-custom-intervals__entry"
    :data-anchor="anchor"
    :data-active="isActive || null"
    :data-today="isToday || null"
    :data-selected="isSelected || null"
  >
    <!-- Every fill before every ring, so no state's fill can hide another state's ring. -->
    <span
      v-for="state in fills"
      :key="`${state}-fill`"
      class="journal-interval-row__layer"
      :data-layer="`${state}-fill`"
      aria-hidden="true"
    />
    <span
      v-for="state in states"
      :key="`${state}-ring`"
      class="journal-interval-row__layer"
      :data-layer="`${state}-ring`"
      aria-hidden="true"
    />
    <NavBlock
      :block="journal.intervalBlock"
      :journal="journal"
      :ref-date="anchor"
      :period="periodForJournal(journal.write, anchor)"
      :block-scope="navBlockDecorationScope"
      :shelf="shelf"
    />
  </div>
</template>

<style scoped>
.journal-view-custom-intervals__entry[data-active] {
  color: var(--journal-cell-active-text-color, var(--journal-saved-cell-active-text-color, var(--text-on-accent)));
  background-color: var(--journal-cell-active-color, var(--journal-saved-cell-active-color, var(--interactive-accent)));
}
/* The nav rows set their own per-row color, so the active highlight forces its color on
   the nested content to win. */
.journal-view-custom-intervals__entry[data-active] :deep(*) {
  color: var(
    --journal-cell-active-text-color,
    var(--journal-saved-cell-active-text-color, var(--text-on-accent))
  ) !important;
}
</style>
