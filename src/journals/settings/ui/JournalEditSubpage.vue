<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";

import type { AnchorString } from "@/calendar";
import { DatePicker, type Picking } from "@/calendar/ui";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { BulkAddFlow } from "@/journals/notes/bulk-add/flows/bulk-add.flow";
import { JournalsViewModel } from "@/journals/view-model";
import type { SubpageNav } from "@/settings";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { describeWrite } from "../describe-write";
import { EditFrontmatterFieldFlow } from "../flows/edit-frontmatter-field.flow";
import { EditSequencePropertyFlow } from "../flows/edit-sequence-property.flow";
import { RenameJournalFlow } from "../flows/rename-journal.flow";

import { JournalEditSectionToken } from "./journal-edit-section";
import { useAnchorField } from "./use-anchor-field";

import type { JournalConfig, NumberingReset } from "../../config";

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

const sequenceOpen = ref(false);
const frontmatterOpen = ref(false);

const startPicking = computed<Picking>(() =>
  config.value?.write.type === "custom" ? "day" : (config.value?.write.type ?? "day"),
);

const numberingAnchorRef = computed<AnchorString>({
  get: () => config.value?.numbering.anchorDate ?? ("" as AnchorString),
  set: (v) => {
    if (config.value) config.value.numbering.anchorDate = v;
  },
});
const numberingAnchorModel = useAnchorField({ anchor: numberingAnchorRef, picking: startPicking });

function setResetKind(kind: NumberingReset["kind"]): void {
  const source = config.value?.numbering.sources[0];
  if (!source) return;
  source.reset = kind === "never" ? { kind: "never" } : { kind: "after", count: 2 };
}

function onSequenceToggle(value: boolean | undefined): void {
  if (!config.value) return;
  config.value.numbering.enabled = value ?? false;
  if (value && config.value.numbering.sources.length === 0) {
    config.value.numbering.sources.push({
      variable: "index",
      frontmatterKey: "journal-index",
      anchorValue: 1,
      reset: { kind: "never" },
    });
  }
}

function rename(): void {
  void flows.invoke(RenameJournalFlow, { journalName });
}
function bulkAdd(): void {
  void flows.invoke(BulkAddFlow, { journalName });
}
function editFm(fieldName: "dateField" | "startDateField" | "endDateField"): void {
  void flows.invoke(EditFrontmatterFieldFlow, { journalName, fieldName });
}
function editSequenceKey(): void {
  void flows.invoke(EditSequencePropertyFlow, { journalName, sourceIndex: 0 });
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

    <UiCollapsibleBlock v-model:expanded="sequenceOpen">
      <template #trigger>
        <span class="journal-section-heading">
          <UiIcon :name="icons.section.numbering" />
          <span>{{ m.journal_edit_section_sequential_numbers() }}</span>
        </span>
      </template>

      <UiSettingRow :name="m.journal_edit_sequence_enabled_label()">
        <template #description>{{ m.journal_edit_sequence_enabled_description() }}</template>
        <UiToggle :model-value="config.numbering.enabled" @update:model-value="onSequenceToggle" />
      </UiSettingRow>

      <template v-if="config.numbering.enabled && config.numbering.sources[0]">
        <UiSettingRow :name="m.journal_edit_anchor_label()">
          <template #description>
            <span v-if="config.timeline.start">{{ m.journal_edit_anchor_start_used() }}</span>
          </template>
          <span v-if="config.timeline.start">{{ config.timeline.start }}</span>
          <DatePicker v-else v-model="numberingAnchorModel" :picking="startPicking" />
        </UiSettingRow>

        <UiSettingRow :name="m.journal_edit_start_number_label()">
          <template #description>{{ m.journal_edit_start_number_description() }}</template>
          <UiNumberInput v-model="config.numbering.sources[0].anchorValue" :min="1" />
        </UiSettingRow>

        <UiSettingRow :name="m.journal_edit_reset_label()">
          <template #description>{{ m.journal_edit_reset_description() }}</template>
          <UiDropdown
            :model-value="config.numbering.sources[0].reset.kind"
            @update:model-value="setResetKind($event as NumberingReset['kind'])"
          >
            <option value="never">{{ m.journal_edit_reset_option({ kind: "never" }) }}</option>
            <option value="after">{{ m.journal_edit_reset_option({ kind: "after" }) }}</option>
          </UiDropdown>
          <template v-if="config.numbering.sources[0].reset.kind === 'after'">
            <UiNumberInput v-model="config.numbering.sources[0].reset.count" :min="2" />
            <span>{{ m.journal_edit_reset_count_suffix() }}</span>
          </template>
        </UiSettingRow>

        <UiSettingRow
          v-if="!config.timeline.start && config.numbering.sources[0].reset.kind === 'never'"
          :name="m.journal_edit_allow_before_label()"
        >
          <template #description>{{ m.journal_edit_allow_before_description() }}</template>
          <UiToggle v-model="config.numbering.allowBefore" />
        </UiSettingRow>

        <UiSettingRow :name="m.common_label_property_name()">
          {{ config.numbering.sources[0].frontmatterKey }}
          <UiIconButton
            :icon="icons.action.configure"
            :tooltip="`${m.common_label_property_name()} edit`"
            @click="editSequenceKey"
          />
        </UiSettingRow>
      </template>
    </UiCollapsibleBlock>

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
