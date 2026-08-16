<script setup lang="ts">
import { ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { SettingsUiService } from "@/settings";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { maintenanceSubpage } from "./maintenance-subpage";

const ui = useService(SettingsUiService);
const expanded = ref(false);
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <UiIconedRow :icon="icons.section.maintenance">{{ m.maintenance_heading() }}</UiIconedRow>
    </template>
    <UiSettingRow>
      <UiButton @click="ui.push(maintenanceSubpage, undefined)">{{ m.maintenance_open() }}</UiButton>
    </UiSettingRow>
  </UiCollapsibleBlock>
</template>
