<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { basenameOf, defineOpenMode, NoticeService, WorkspaceService, type VaultPath } from "@/infrastructure/host";

import { periodLabelOf } from "./period-label";

import type { NoteletListing, NoteletTypeGroup } from "../listing";

const props = defineProps<{ listing: NoteletListing }>();

const workspace = useService(WorkspaceService);
const notices = useService(NoticeService);

const showPeriodHeadings = computed(() => props.listing.periods.length > 1);

function typeLabel(group: NoteletTypeGroup): string {
  const base = props.listing.qualifyByJournal
    ? m.journal_notelet_list_type_qualified({ journal: group.journalName, type: group.typeName })
    : group.typeName;
  return group.typeId === null ? m.journal_notelet_list_unresolved_type({ type: base }) : base;
}

function open(path: VaultPath, event: MouseEvent): void {
  void workspace.openNote(path, defineOpenMode(event)).tapErr(() => notices.show(m.common_note_open_error()));
}
</script>

<template>
  <div class="journal-notelet-list">
    <p v-if="listing.total === 0" class="journal-notelet-list__empty">{{ m.journal_notelet_list_empty() }}</p>
    <section v-for="period of listing.periods" :key="period.key" class="journal-notelet-list__period">
      <h4 v-if="showPeriodHeadings" class="journal-notelet-list__period-heading">{{ periodLabelOf(period) }}</h4>
      <section v-for="type of period.types" :key="type.key" class="journal-notelet-list__type">
        <h5 class="journal-notelet-list__type-heading" :class="{ 'is-unresolved': type.typeId === null }">
          {{ typeLabel(type) }}
        </h5>
        <button
          v-for="notelet of type.notelets"
          :key="notelet.path"
          type="button"
          class="journal-notelet-list__row"
          @click="open(notelet.path, $event)"
          @auxclick.middle.prevent="open(notelet.path, $event)"
        >
          {{ basenameOf(notelet.path) }}
        </button>
      </section>
    </section>
  </div>
</template>

<style scoped>
.journal-notelet-list {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-2);
}
.journal-notelet-list__empty {
  margin: 0;
  color: var(--text-muted);
}
.journal-notelet-list__period,
.journal-notelet-list__type {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-1);
}
.journal-notelet-list__period-heading,
.journal-notelet-list__type-heading {
  margin: 0;
  font-size: var(--font-ui-smaller);
  color: var(--text-muted);
}
.journal-notelet-list__type-heading.is-unresolved {
  color: var(--text-error);
}
.journal-notelet-list__row {
  justify-content: flex-start;
  padding: var(--size-4-1) var(--size-4-2);
  border: none;
  background-color: transparent;
  box-shadow: none;
  color: var(--text-normal);
  text-align: left;
  cursor: pointer;
}
.journal-notelet-list__row:hover {
  background-color: var(--background-modifier-hover);
}
</style>
