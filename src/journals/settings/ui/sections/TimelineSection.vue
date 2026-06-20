<script setup lang="ts">
import { computed, ref } from "vue";

import { CalendarDate, OpenInterval, type AnchorString } from "@/calendar";
import { DatePicker, type Picking } from "@/calendar/ui";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { icons } from "@/ui/icons";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiNumberInput from "@/ui/UiNumberInput.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { JournalsViewModel } from "../../../view-model";
import { useAnchorField } from "../use-anchor-field";

import type { JournalConfig, TimelineEnd } from "../../../config";

const { journalName } = defineProps<{ journalName: string }>();

const journalsVM = useService(JournalsViewModel);
const config = computed<JournalConfig | undefined>(() => journalsVM.getJournal(journalName).getOr(undefined as never));

const expanded = ref(false);

const startPicking = computed<Picking>(() =>
  config.value?.write.type === "custom" ? "day" : (config.value?.write.type ?? "day"),
);

const startAnchorRef = computed<AnchorString>({
  get: () => config.value?.timeline.start ?? ("" as AnchorString),
  set: (v) => {
    if (config.value) config.value.timeline.start = v;
  },
});
const startModel = useAnchorField({ anchor: startAnchorRef, picking: startPicking });

const endAnchorRef = computed<AnchorString>({
  get: () => (config.value?.timeline.end.kind === "date" ? config.value.timeline.end.date : ("" as AnchorString)),
  set: (v) => {
    if (config.value?.timeline.end.kind === "date") config.value.timeline.end.date = v;
  },
});
const endModel = useAnchorField({ anchor: endAnchorRef, picking: startPicking });

const endBounds = computed<OpenInterval | undefined>(() => {
  const start = config.value?.timeline.start;
  return start ? OpenInterval.from(CalendarDate.fromAnchor(start)) : undefined;
});

function clearStart(): void {
  if (config.value && config.value.write.type !== "custom") {
    startModel.value = null;
  }
}
function setEndKind(kind: TimelineEnd["kind"]): void {
  if (!config.value) return;
  if (kind === "never") config.value.timeline.end = { kind: "never" };
  else if (kind === "date") config.value.timeline.end = { kind: "date", date: "" as never };
  else config.value.timeline.end = { kind: "repeats", count: 1 };
}
</script>

<template>
  <UiCollapsibleBlock v-if="config" v-model:expanded="expanded">
    <template #trigger>
      <span class="journal-section-heading">
        <UiIcon :name="icons.section.timeline" />
        <span>{{ m.journal_edit_section_timeline() }}</span>
      </span>
    </template>

    <UiSettingRow :name="m.journal_edit_start_writing_label()">
      <template #description>
        <div>{{ m.journal_edit_start_writing_description() }}</div>
        <div v-if="config.write.type === 'custom'" class="journal-hint">
          {{ m.journal_edit_start_writing_custom_locked() }}
        </div>
      </template>
      <span v-if="config.write.type === 'custom'">{{ config.write.anchorDate }}</span>
      <template v-else>
        <DatePicker v-model="startModel" :picking="startPicking" />
        <UiIconButton
          v-if="config.timeline.start"
          :icon="icons.action.delete"
          :tooltip="m.common_action_close()"
          @click="clearStart"
        />
      </template>
    </UiSettingRow>

    <UiSettingRow :name="m.journal_edit_end_writing_label()">
      <template #description>
        <div>{{ m.journal_edit_end_description({ kind: config.timeline.end.kind }) }}</div>
        <div v-if="config.timeline.end.kind === 'repeats' && !config.timeline.start" class="journal-hint">
          {{ m.journal_edit_end_repeats_needs_start_warning() }}
        </div>
      </template>
      <UiDropdown
        :model-value="config.timeline.end.kind"
        @update:model-value="setEndKind($event as TimelineEnd['kind'])"
      >
        <option value="never">{{ m.journal_edit_end_kind({ kind: "never" }) }}</option>
        <option value="date">{{ m.journal_edit_end_kind({ kind: "date" }) }}</option>
        <option value="repeats">{{ m.journal_edit_end_kind({ kind: "repeats" }) }}</option>
      </UiDropdown>
      <DatePicker
        v-if="config.timeline.end.kind === 'date'"
        v-model="endModel"
        :picking="startPicking"
        :bounds="endBounds"
      />
      <UiNumberInput v-if="config.timeline.end.kind === 'repeats'" v-model="config.timeline.end.count" :min="1" />
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
.journal-hint {
  color: var(--text-warning);
}
</style>
