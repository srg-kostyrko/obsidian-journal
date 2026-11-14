<script setup lang="ts">
import { computed } from "vue";

import { calendarDisplaySlice } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { SettingsService } from "@/settings";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { structureAt, withStructure } from "../appearance-editing";

import { controlLabel, optionLabel } from "./control-copy";

import type { StructureControl } from "../appearance-parts";

const { control } = defineProps<{ control: StructureControl }>();

const display = useService(SettingsService).getSlice(calendarDisplaySlice);

const label = computed(() => controlLabel(control));
const value = computed(() => String(structureAt(display.state, control)));

function write(next: string): void {
  display.state = withStructure(display.state, control, next);
}
</script>

<template>
  <UiSettingRow class="appearance-control">
    <template #name>{{ label }}</template>
    <template #description>{{ m.calendar_appearance_all_widths() }}</template>
    <UiDropdown :model-value="value" :aria-label="label" @update:model-value="write">
      <option v-for="option of control.options" :key="option" :value="option">
        {{ optionLabel(control, option) }}
      </option>
    </UiDropdown>
  </UiSettingRow>
</template>
