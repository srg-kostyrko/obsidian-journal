<script setup lang="ts">
import { computed } from "vue";

import { formatConjunction, m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { JournalsViewModel } from "@/journals/view-model";
import { SettingsUiService } from "@/settings";
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
    <UiSettingRow heading :name="m.journal_colliding_heading()" />
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
.journal-warning {
  border: 1px solid var(--text-error);
  padding: var(--size-2-2);
}
.journal-warning :deep(.setting-item) {
  padding: 0;
}
.journal-warning :deep(.setting-item--heading .setting-item-name) {
  color: var(--text-error);
}
.journal-warning-links {
  display: inline-flex;
  gap: var(--size-2-2);
  margin-left: var(--size-2-2);
}
</style>
