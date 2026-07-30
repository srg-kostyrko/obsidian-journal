<script setup lang="ts">
import { computed, onUnmounted, watchEffect } from "vue";

import { formatConjunction, m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { JournalsEventsToken } from "@/journals/tokens";
import { JournalsViewModel } from "@/journals/view-model";
import type { SubpageNav } from "@/settings";
import { icons } from "@/ui/icons";
import UiBackLink from "@/ui/UiBackLink.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { describeWrite } from "../describe-write";
import { RenameJournalFlow } from "../flows/rename-journal.flow";

import { findCollidingJournals } from "./colliding-journals";
import { JournalEditSectionToken } from "./journal-edit-section";

const { journalName, nav } = defineProps<{ journalName: string; nav: SubpageNav<{ journalName: string }> }>();

const flows = useService(Flows);
const journalsEvents = useService(JournalsEventsToken);
const journalsVM = useService(JournalsViewModel);
const editSections = useService(JournalEditSectionToken).toSorted((a, b) => a.order - b.order);
const config = computed(() => journalsVM.getJournal(journalName).getOrUndefined());

// Journals are keyed by name, so a rename makes this page's key stale: follow it before the
// missing-journal guard below reads it as a deletion.
onUnmounted(
  journalsEvents.on("renamed", (oldName, newName) => {
    if (oldName === journalName) nav.replace({ journalName: newName });
  }),
);

watchEffect(() => {
  if (!config.value) nav.back();
});

const writing = computed(() => {
  if (!config.value) return "";
  const desc = describeWrite(config.value.write);
  return m.journal_write({ every: "day", duration: 1, ...desc });
});

const collidingJournalNames = computed<string>(() => {
  const group = findCollidingJournals(journalsVM.journals.value).find((journals) =>
    journals.some((journal) => journal.name === journalName),
  );
  if (!group) return "";
  return formatConjunction(group.filter((journal) => journal.name !== journalName).map((journal) => journal.name));
});

function rename(): void {
  void flows.invoke(RenameJournalFlow, { journalName });
}
</script>

<template>
  <div v-if="config">
    <UiBackLink @click="nav.back()" />

    <UiSettingRow heading>
      <template #name>
        {{ journalName }}
        <span class="flair">{{ writing }}</span>
      </template>
      <UiIconButton :icon="icons.action.edit" :tooltip="m.journal_edit_rename_tooltip()" @click="rename" />
    </UiSettingRow>

    <div v-if="collidingJournalNames" class="journal-warning">
      {{ m.journal_edit_colliding_warning({ names: collidingJournalNames }) }}
    </div>

    <component :is="section.component" v-for="section in editSections" :key="section.key" :journal-name="journalName" />
  </div>
</template>

<style scoped>
.journal-warning {
  border: 1px solid var(--text-error);
  color: var(--text-error);
  padding: var(--size-2-2);
  margin-bottom: var(--size-4-2);
}
</style>
