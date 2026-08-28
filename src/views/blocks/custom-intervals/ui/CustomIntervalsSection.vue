<script setup lang="ts">
import type { AnchorString } from "@/calendar";
import { navBlockDecorationScope } from "@/code-blocks/nav/decoration-scopes";
import { periodForJournal } from "@/code-blocks/nav/period-for-journal";
import NavBlock from "@/code-blocks/nav/ui/NavBlock.vue";
import { hasOffsetCondition, useCellDecorations } from "@/decorations";
import { useService } from "@/infrastructure/di";
import type { JournalConfig } from "@/journals";
import { ActiveEntryViewModel } from "@/notes-calendar/active-entry";

const props = defineProps<{
  journal: JournalConfig;
  entries: readonly { anchor: AnchorString }[];
  shelf: string | null;
}>();

const activeEntry = useService(ActiveEntryViewModel);

function isEntryActive(anchor: AnchorString): boolean {
  const current = activeEntry.active.value;
  return current !== null && current.journalName === props.journal.name && current.anchor === anchor;
}

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
    <div
      v-for="entry of entries"
      :key="entry.anchor"
      class="journal-view-custom-intervals__entry"
      :data-anchor="entry.anchor"
      :data-active="isEntryActive(entry.anchor) || null"
    >
      <NavBlock
        :block="journal.intervalBlock"
        :journal="journal"
        :ref-date="entry.anchor"
        :period="periodForJournal(journal.write, entry.anchor)"
        :block-scope="navBlockDecorationScope"
        :shelf="shelf"
      />
    </div>
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
.journal-view-custom-intervals__entry[data-active] {
  color: var(--journal-cell-active-color);
  background-color: var(--journal-cell-active-bg);
}
/* The nav rows set their own per-row color, so the active highlight forces its color on
   the nested content to win. */
.journal-view-custom-intervals__entry[data-active] :deep(*) {
  color: var(--journal-cell-active-color) !important;
}
</style>
