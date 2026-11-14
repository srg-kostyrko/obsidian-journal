<script setup lang="ts">
import type { AnchorString } from "@/calendar";
import { navBlockDecorationScope } from "@/code-blocks/nav/decoration-scopes";
import { periodForJournal } from "@/code-blocks/nav/period-for-journal";
import { hasOffsetCondition, useCellDecorations } from "@/decorations";
import type { JournalConfig } from "@/journals";

import IntervalRow from "./IntervalRow.vue";

const props = defineProps<{
  journal: JournalConfig;
  entries: readonly { anchor: AnchorString }[];
  shelf: string | null;
}>();

// One section per journal, and the map lives here rather than in the parent because an interval
// is a "day"-kind period at its start anchor: two custom journals whose intervals begin on the
// same date produce the same cell key, so a map spanning both paints each journal's rows with
// the other's decorations. A per-section provide also matches what the whole-block draw means
// everywhere else — the host journal's own decorations, nobody else's.
useCellDecorations({
  periods: () => props.entries.map((entry) => periodForJournal(props.journal.write, entry.anchor)),
  journalNames: () => [props.journal.name],
  scope: navBlockDecorationScope,
  // Offset decorations mark single days inside an interval; they render on the day
  // calendar grid, never on the whole-interval row.
  filter: (binding) => !hasOffsetCondition(binding.decoration),
});
</script>

<template>
  <section class="journal-view-custom-intervals__section" :data-journal="journal.name">
    <IntervalRow
      v-for="entry of entries"
      :key="entry.anchor"
      :journal="journal"
      :anchor="entry.anchor"
      :shelf="shelf"
    />
  </section>
</template>

<style scoped>
.journal-view-custom-intervals__section {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
  border-bottom: 1px solid var(--color-accent);
  padding-bottom: var(--size-2-2);
}
.journal-view-custom-intervals__section:last-child {
  border-bottom: 0;
}
</style>
