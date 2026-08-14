<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { SettingsService } from "@/settings";
import { icons } from "@/ui/icons";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
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
      <UiIconedRow :icon="icons.section.startup">{{ m.startup_dashboard_section_title() }}</UiIconedRow>
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
