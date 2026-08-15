<script setup lang="ts">
import { computed, ref } from "vue";

import type { AnchorString } from "@/calendar";
import { DatePicker, useAnchorField, type Picking } from "@/calendar/ui";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { icons } from "@/ui/icons";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import { pickingForWrite } from "../../../picking";
import { JournalsViewModel } from "../../../view-model";
import { EditNumberingDigitFlow } from "../../flows/edit-numbering-digit.flow";
import SequencePreview from "../SequencePreview.vue";

const { journalName } = defineProps<{ journalName: string }>();

const flows = useService(Flows);
const journalsVM = useService(JournalsViewModel);
const config = computed(() => journalsVM.getJournal(journalName).getOrUndefined());

const expanded = ref(false);

const sources = computed(() => config.value?.numbering.sources ?? []);
const topDigit = computed(() => sources.value.at(0));

const startPicking = computed<Picking>(() => (config.value ? pickingForWrite(config.value.write) : "day"));
const numberingAnchorRef = computed<AnchorString>({
  get: () => config.value?.numbering.anchorDate ?? ("" as AnchorString),
  set: (value) => {
    if (config.value) config.value.numbering.anchorDate = value;
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

function addDigit(): void {
  void flows.invoke(EditNumberingDigitFlow, { journalName });
}
function editDigit(sourceIndex: number): void {
  void flows.invoke(EditNumberingDigitFlow, { journalName, sourceIndex });
}
function deleteDigit(sourceIndex: number): void {
  config.value?.numbering.sources.splice(sourceIndex, 1);
}

function summaryFor(sourceIndex: number): string {
  const source = sources.value[sourceIndex];
  if (!source) return "";
  if (source.reset.kind === "never") {
    return m.journal_sequence_digit_summary({
      kind: "never",
      start: source.anchorValue,
      count: 0,
      parent: "",
    });
  }
  const parent = sources.value[sourceIndex - 1]?.variable;
  return parent === undefined
    ? m.journal_sequence_digit_summary_cyclic({ start: source.anchorValue, count: source.reset.count })
    : m.journal_sequence_digit_summary({
        kind: "after",
        start: source.anchorValue,
        count: source.reset.count,
        parent,
      });
}
</script>

<template>
  <UiCollapsibleBlock v-if="config" v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow :icon="icons.section.numbering">
        {{ m.journal_edit_section_sequential_numbers() }}
        <span v-if="config.numbering.enabled" class="flair">{{ sources.length }}</span>
      </UiIconedRow>
    </template>
    <template #controls>
      <UiIconButton
        v-if="config.numbering.enabled"
        :icon="icons.action.add"
        :tooltip="m.journal_sequence_digit_add()"
        @click="addDigit"
      />
    </template>

    <UiSettingRow :name="m.journal_edit_sequence_enabled_label()">
      <template #description>{{ m.journal_edit_sequence_enabled_description() }}</template>
      <UiToggle :model-value="config.numbering.enabled" @update:model-value="onSequenceToggle" />
    </UiSettingRow>

    <template v-if="config.numbering.enabled && topDigit">
      <UiSettingRow :name="m.journal_edit_anchor_label()">
        <template #description>
          {{ m.journal_edit_anchor_description() }}
          <template v-if="config.timeline.start">{{ m.journal_edit_anchor_start_used() }}</template>
        </template>
        <span v-if="config.timeline.start">{{ config.timeline.start }}</span>
        <DatePicker v-else v-model="numberingAnchorModel" :picking="startPicking" />
      </UiSettingRow>

      <UiSettingRow
        v-if="!config.timeline.start && topDigit.reset.kind === 'never'"
        :name="m.journal_edit_allow_before_label()"
      >
        <template #description>{{ m.journal_edit_allow_before_description() }}</template>
        <UiToggle v-model="config.numbering.allowBefore" />
      </UiSettingRow>

      <div class="sequence-digits">
        <div v-if="sources.length > 1" class="sequence-digits__edge">{{ m.journal_sequence_slowest_label() }}</div>
        <div v-for="(source, sourceIndex) of sources" :key="source.variable" class="sequence-digit">
          <span class="sequence-digit__variable">{{ source.variable }}</span>
          <span class="sequence-digit__summary">{{ summaryFor(sourceIndex) }}</span>
          <span class="sequence-digit__actions">
            <UiIconButton
              :icon="icons.action.configure"
              :tooltip="m.journal_sequence_digit_edit()"
              @click="editDigit(sourceIndex)"
            />
            <UiIconButton
              v-if="sources.length > 1"
              :icon="icons.action.delete"
              :tooltip="m.journal_sequence_digit_delete()"
              @click="deleteDigit(sourceIndex)"
            />
          </span>
        </div>
        <div v-if="sources.length > 1" class="sequence-digits__edge">{{ m.journal_sequence_fastest_label() }}</div>
      </div>

      <SequencePreview :journal-name="journalName" />
    </template>
  </UiCollapsibleBlock>
</template>

<style scoped>
.sequence-digits {
  padding: var(--size-4-2) 0;
}
.sequence-digits__edge {
  font-size: var(--font-ui-smaller);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-faint);
}
.sequence-digit {
  display: flex;
  align-items: center;
  gap: var(--size-4-2);
  padding-block: var(--size-2-3);
  border-bottom: 1px solid var(--background-modifier-border);
}
.sequence-digit:last-of-type {
  border-bottom: 0;
}
.sequence-digit__variable {
  font-family: var(--font-monospace);
  font-weight: var(--font-semibold);
}
.sequence-digit__summary {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--text-muted);
  font-size: var(--font-ui-small);
}
.sequence-digit__actions {
  display: inline-flex;
  gap: var(--size-2-1);
  --icon-size: var(--icon-s);
}
</style>
