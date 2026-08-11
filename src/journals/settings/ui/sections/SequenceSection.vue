<script setup lang="ts">
import { computed, ref } from "vue";

import type { AnchorString } from "@/calendar";
import { DatePicker, useAnchorField, type Picking } from "@/calendar/ui";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { icons } from "@/ui/icons";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { pickingForWrite } from "../../../picking";
import { JournalsViewModel } from "../../../view-model";
import { EditSequencePropertyFlow } from "../../flows/edit-sequence-property.flow";

import type { NumberingReset } from "../../../config";

const { journalName } = defineProps<{ journalName: string }>();

const flows = useService(Flows);
const journalsVM = useService(JournalsViewModel);
const config = computed(() => journalsVM.getJournal(journalName).getOrUndefined());

const expanded = ref(false);

const startPicking = computed<Picking>(() => (config.value ? pickingForWrite(config.value.write) : "day"));
const numberingAnchorRef = computed<AnchorString>({
  get: () => config.value?.numbering.anchorDate ?? ("" as AnchorString),
  set: (v) => {
    if (config.value) config.value.numbering.anchorDate = v;
  },
});
const numberingAnchorModel = useAnchorField({ anchor: numberingAnchorRef, picking: startPicking });

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
function setResetKind(kind: NumberingReset["kind"]): void {
  const source = config.value?.numbering.sources[0];
  if (!source) return;
  source.reset = kind === "never" ? { kind: "never" } : { kind: "after", count: 2 };
}
function editSequenceKey(): void {
  void flows.invoke(EditSequencePropertyFlow, { journalName, sourceIndex: 0 });
}
</script>

<template>
  <UiCollapsibleBlock v-if="config" v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow :icon="icons.section.numbering">{{ m.journal_edit_section_sequential_numbers() }}</UiIconedRow>
    </template>

    <UiSettingRow :name="m.journal_edit_sequence_enabled_label()">
      <template #description>{{ m.journal_edit_sequence_enabled_description() }}</template>
      <UiToggle :model-value="config.numbering.enabled" @update:model-value="onSequenceToggle" />
    </UiSettingRow>

    <template v-if="config.numbering.enabled && config.numbering.sources[0]">
      <UiSettingRow :name="m.journal_edit_anchor_label()">
        <template #description>
          {{ m.journal_edit_anchor_description() }}
          <template v-if="config.timeline.start">{{ m.journal_edit_anchor_start_used() }}</template>
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
          :tooltip="m.journal_sequence_property_modal_title()"
          @click="editSequenceKey"
        />
      </UiSettingRow>
    </template>
  </UiCollapsibleBlock>
</template>
