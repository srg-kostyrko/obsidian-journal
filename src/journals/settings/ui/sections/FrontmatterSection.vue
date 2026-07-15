<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { icons } from "@/ui/icons";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { JournalsViewModel } from "../../../view-model";
import { EditFrontmatterFieldFlow } from "../../flows/edit-frontmatter-field.flow";
import { useReapplyFrontmatterOnToggle } from "../use-reapply-frontmatter-on-toggle";

const { journalName } = defineProps<{ journalName: string }>();

const flows = useService(Flows);
const journalsVM = useService(JournalsViewModel);
const config = computed(() => journalsVM.getJournal(journalName).getOrUndefined());
useReapplyFrontmatterOnToggle(config);

const expanded = ref(false);

function editFm(fieldName: "dateField" | "startDateField" | "endDateField"): void {
  void flows.invoke(EditFrontmatterFieldFlow, { journalName, fieldName });
}
</script>

<template>
  <UiCollapsibleBlock v-if="config" v-model:expanded="expanded">
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
        :tooltip="m.journal_fm_field_modal_title({ field: 'dateField' })"
        @click="editFm('dateField')"
      />
    </UiSettingRow>

    <UiSettingRow :name="m.journal_edit_fm_start_toggle_label()">
      <template #description>{{ m.journal_edit_fm_start_description() }}</template>
      <UiToggle v-model="config.frontmatter.addStartDate" />
    </UiSettingRow>
    <UiSettingRow v-if="config.frontmatter.addStartDate" :name="m.journal_fm_field_label({ field: 'startDateField' })">
      {{ config.frontmatter.startDateField }}
      <UiIconButton
        :icon="icons.action.configure"
        :tooltip="m.journal_fm_field_modal_title({ field: 'startDateField' })"
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
        :tooltip="m.journal_fm_field_modal_title({ field: 'endDateField' })"
        @click="editFm('endDateField')"
      />
    </UiSettingRow>
  </UiCollapsibleBlock>
</template>

<style scoped>
.journal-section-heading {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-2);
  font-weight: var(--font-semibold);
}
</style>
