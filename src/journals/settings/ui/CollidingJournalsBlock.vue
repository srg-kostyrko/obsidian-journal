<script setup lang="ts">
import { computed } from "vue";

import { formatConjunction, m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { JournalsViewModel } from "@/journals/view-model";
import { SettingsUiService } from "@/settings";
import { manual } from "@/ui/manual";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { findCollidingJournals } from "./colliding-journals";
import { journalEditSubpage } from "./journals-subpage";

const journalsVM = useService(JournalsViewModel);
const ui = useService(SettingsUiService);
const groups = computed(() => findCollidingJournals(journalsVM.journals.value));

function openJournal(journalName: string): void {
  ui.push(journalEditSubpage, { journalName });
}
</script>

<template>
  <div v-if="groups.length > 0" class="journal-warning">
    <UiSettingRow heading :name="m.journal_colliding_heading()" :help="manual.troubleshooting.collidingJournals" />
    <div v-for="(group, index) in groups" :key="index">
      {{ m.journal_colliding_warning({ names: formatConjunction(group.map((journal) => journal.name)) }) }}
      <span class="journal-warning-links">
        <a v-for="journal in group" :key="journal.name" href="#" @click.prevent="openJournal(journal.name)">
          {{ m.journal_dashboard_edit({ name: journal.name }) }}
        </a>
      </span>
    </div>
  </div>
</template>

<style scoped>
/* One card rather than a box around cards, matching the import notice: Obsidian fills and rounds
   every .setting-item and spaces it with a bottom margin of its own, so a row has to be flattened
   on all three or the warning reads as a container of separate things and outgrows its contents. */
.journal-warning {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-inline-start: 3px solid var(--text-error);
  border-radius: var(--radius-m);
  padding: var(--size-4-3) var(--size-4-4);
  margin-block-end: var(--size-4-5);
  display: flex;
  flex-direction: column;
  gap: var(--size-4-2);
}
.journal-warning :deep(.setting-item) {
  padding: 0;
  margin: 0;
  border: none;
  background: transparent;
  border-radius: 0;
}
.journal-warning :deep(.setting-item-heading .setting-item-name) {
  color: var(--text-error);
}
.journal-warning-links {
  display: inline-flex;
  gap: var(--size-2-2);
  margin-left: var(--size-2-2);
}
</style>
