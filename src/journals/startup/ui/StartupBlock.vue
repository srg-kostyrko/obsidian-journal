<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { SettingsService } from "@/settings";
import { icons } from "@/ui/icons";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { JournalsRepository } from "../../repository";
import { startupSlice } from "../slice";

const settings = useService(SettingsService);
const journals = useService(JournalsRepository);
const slice = settings.getSlice(startupSlice);
const expanded = ref(false);

const options = computed(() => [...journals.find().options()]);

const journalName = computed({
  get: () => slice.state.journalName,
  set: (name: string) => {
    slice.state = { journalName: name };
  },
});
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <span class="section-heading">
        <UiIcon :name="icons.section.startup" />
        <span class="section-title">{{ m.startup_dashboard_section_title() }}</span>
      </span>
    </template>
    <UiSettingRow :name="m.startup_open_note_title()">
      <template #description>{{ m.startup_open_note_desc() }}</template>
      <UiDropdown v-model="journalName">
        <option value="">{{ m.startup_dont_open_option() }}</option>
        <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
      </UiDropdown>
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
