<script setup lang="ts">
import { periodKinds, type PeriodKind } from "@/calendar";
import { m } from "@/i18n";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";
import UiToggle from "@/ui/UiToggle.vue";

import type { DayNotesBlockConfig, DayNotesBlockConfigChange } from "../day-notes-block";

const props = defineProps<{
  config: DayNotesBlockConfig;
  onChange: DayNotesBlockConfigChange;
}>();

const update = (patch: Partial<DayNotesBlockConfig>): void => props.onChange({ ...props.config, ...patch });
</script>

<template>
  <UiSettingRow :name="m.view_block_day_notes_granularity_label()">
    <UiDropdown
      :model-value="config.granularity"
      @update:model-value="
        (value: string | undefined) => value && update({ granularity: value as DayNotesBlockConfig['granularity'] })
      "
    >
      <option v-for="kind of periodKinds" :key="kind" :value="kind">
        {{ m.view_block_day_notes_granularity_option({ kind: kind as PeriodKind }) }}
      </option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow :name="m.view_block_day_notes_sort_field_label()">
    <UiDropdown
      :model-value="config.sortField"
      @update:model-value="
        (value: string | undefined) => value && update({ sortField: value as DayNotesBlockConfig['sortField'] })
      "
    >
      <option value="name">{{ m.view_block_day_notes_sort_name() }}</option>
      <option value="modified">{{ m.view_block_day_notes_sort_modified() }}</option>
      <option value="created">{{ m.view_block_day_notes_sort_created() }}</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow :name="m.view_block_day_notes_sort_direction_label()">
    <UiDropdown
      :model-value="config.sortDirection"
      @update:model-value="
        (value: string | undefined) => value && update({ sortDirection: value as DayNotesBlockConfig['sortDirection'] })
      "
    >
      <option value="asc">{{ m.view_block_day_notes_sort_ascending() }}</option>
      <option value="desc">{{ m.view_block_day_notes_sort_descending() }}</option>
    </UiDropdown>
  </UiSettingRow>
  <UiSettingRow :name="m.view_block_day_notes_show_heading_label()">
    <UiToggle
      :model-value="config.showHeading"
      @update:model-value="(value: boolean | undefined) => update({ showHeading: value ?? false })"
    />
  </UiSettingRow>
  <UiSettingRow :name="m.view_block_day_notes_show_navigation_label()">
    <UiToggle
      :model-value="config.showNavigation"
      @update:model-value="(value: boolean | undefined) => update({ showNavigation: value ?? false })"
    />
  </UiSettingRow>
</template>
