<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { BulkAddFlow } from "@/journals/notes/bulk-add/flows/bulk-add.flow";
import { JournalsViewModel } from "@/journals/view-model";
import type { SubpageNav } from "@/settings";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { describeWrite } from "../describe-write";
import { EditFrontmatterFieldFlow } from "../flows/edit-frontmatter-field.flow";
import { RenameJournalFlow } from "../flows/rename-journal.flow";

import { JournalEditSectionToken } from "./journal-edit-section";

import type { JournalConfig } from "../../config";

const { journalName, nav } = defineProps<{ journalName: string; nav: SubpageNav }>();

const flows = useService(Flows);
const journalsVM = useService(JournalsViewModel);
const editSections = useService(JournalEditSectionToken).toSorted((a, b) => a.order - b.order);
const config = computed<JournalConfig | undefined>(() => journalsVM.getJournal(journalName).getOr(undefined as never));

watchEffect(() => {
  if (!config.value) nav.back();
});

const writing = computed(() => {
  if (!config.value) return "";
  const desc = describeWrite(config.value.write);
  return m.journal_write({ every: "day", duration: 1, ...desc });
});

const frontmatterOpen = ref(false);

function rename(): void {
  void flows.invoke(RenameJournalFlow, { journalName });
}
function bulkAdd(): void {
  void flows.invoke(BulkAddFlow, { journalName });
}
function editFm(fieldName: "dateField" | "startDateField" | "endDateField"): void {
  void flows.invoke(EditFrontmatterFieldFlow, { journalName, fieldName });
}
</script>

<template>
  <div v-if="config">
    <UiSettingRow heading>
      <template #name>{{ m.journal_edit_header_title({ name: journalName, writing }) }}</template>
      <UiButton @click="bulkAdd">{{ m.bulk_add_command() }}</UiButton>
      <UiIconButton :icon="icons.action.edit" :tooltip="m.journal_edit_rename_tooltip()" @click="rename" />
      <UiIconButton :icon="icons.nav.back" :tooltip="m.journal_edit_back_tooltip()" @click="nav.back()" />
    </UiSettingRow>

    <UiCollapsibleBlock v-model:expanded="frontmatterOpen">
      <template #trigger>
        <span class="journal-section-heading">
          <UiIcon :name="icons.section.properties" />
          <span>{{ m.journal_edit_section_frontmatter() }}</span>
        </span>
      </template>

      <UiSettingRow :name="m.journal_fm_field_label({ field: 'dateField' })">
        {{ config.frontmatter.dateField }}
        <UiIconButton
          :icon="icons.action.configure"
          :tooltip="`${m.journal_fm_field_label({ field: 'dateField' })} edit`"
          @click="editFm('dateField')"
        />
      </UiSettingRow>

      <UiSettingRow :name="m.journal_edit_fm_start_toggle_label()">
        <template #description>{{ m.journal_edit_fm_start_description() }}</template>
        <UiToggle v-model="config.frontmatter.addStartDate" />
      </UiSettingRow>
      <UiSettingRow
        v-if="config.frontmatter.addStartDate"
        :name="m.journal_fm_field_label({ field: 'startDateField' })"
      >
        {{ config.frontmatter.startDateField }}
        <UiIconButton
          :icon="icons.action.configure"
          :tooltip="`${m.journal_fm_field_label({ field: 'startDateField' })} edit`"
          @click="editFm('startDateField')"
        />
      </UiSettingRow>

      <UiSettingRow :name="m.journal_edit_fm_end_toggle_label()">
        <UiToggle v-model="config.frontmatter.addEndDate" />
      </UiSettingRow>
      <UiSettingRow v-if="config.frontmatter.addEndDate" :name="m.journal_fm_field_label({ field: 'endDateField' })">
        {{ config.frontmatter.endDateField }}
        <UiIconButton
          :icon="icons.action.configure"
          :tooltip="`${m.journal_fm_field_label({ field: 'endDateField' })} edit`"
          @click="editFm('endDateField')"
        />
      </UiSettingRow>
    </UiCollapsibleBlock>

    <component :is="section.component" v-for="section in editSections" :key="section.key" :journal-name="journalName" />
  </div>
</template>

<style scoped>
.journal-section-heading {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-2);
  font-weight: var(--font-semibold);
}
.journal-hint {
  color: var(--text-warning);
}
.journal-recommendation {
  color: var(--text-warning);
  padding: var(--size-2-2) 0;
}
.journal-form-error {
  color: var(--text-error);
  display: block;
}
.grow {
  flex-grow: 1;
}
</style>
