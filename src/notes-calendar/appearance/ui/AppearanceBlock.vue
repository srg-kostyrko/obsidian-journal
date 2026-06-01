<script setup lang="ts">
import { ref } from "vue";

import type { ColorSettings } from "@/decorations";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { SettingsService } from "@/settings";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiColorSettingsPicker from "@/ui/UiColorSettingsPicker.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { appearanceSlice } from "../slice";

const settings = useService(SettingsService);
const slice = settings.getSlice(appearanceSlice);
const expanded = ref(false);

function setTodayColor(color: ColorSettings): void {
  slice.state = { ...slice.state, today: { ...slice.state.today, color } };
}
function setTodayBackground(background: ColorSettings): void {
  slice.state = { ...slice.state, today: { ...slice.state.today, background } };
}
function setActiveColor(color: ColorSettings): void {
  slice.state = { ...slice.state, active: { ...slice.state.active, color } };
}
function setActiveBackground(background: ColorSettings): void {
  slice.state = { ...slice.state, active: { ...slice.state.active, background } };
}
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <span class="section-heading">
        <UiIcon name="palette" />
        <span class="section-title">{{ m.calendar_appearance_section_title() }}</span>
      </span>
    </template>
    <UiSettingRow :name="m.calendar_appearance_today_text()">
      <UiColorSettingsPicker :model-value="slice.state.today.color" @update:model-value="setTodayColor" />
    </UiSettingRow>
    <UiSettingRow :name="m.calendar_appearance_today_background()">
      <UiColorSettingsPicker :model-value="slice.state.today.background" @update:model-value="setTodayBackground" />
    </UiSettingRow>
    <UiSettingRow :name="m.calendar_appearance_active_text()">
      <UiColorSettingsPicker :model-value="slice.state.active.color" @update:model-value="setActiveColor" />
    </UiSettingRow>
    <UiSettingRow :name="m.calendar_appearance_active_background()">
      <UiColorSettingsPicker :model-value="slice.state.active.background" @update:model-value="setActiveBackground" />
    </UiSettingRow>
  </UiCollapsibleBlock>
</template>

<style scoped>
.section-heading {
  display: inline-flex;
  align-items: center;
  gap: var(--size-2-2);
}
.section-title {
  font-weight: var(--font-semibold);
}
</style>
