<script setup lang="ts">
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { SettingsUiService } from "@/settings";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { maintenanceSubpage } from "./maintenance-subpage";

const ui = useService(SettingsUiService);
</script>

<template>
  <!-- Not a collapsible like its sibling dashboard blocks: they expand onto real content, while
       this one only ever holds a link to its subpage. Expanding to reveal a single button costs
       a click and shows an otherwise empty row. -->
  <UiSettingRow heading>
    <template #name>
      <UiIconedRow :icon="icons.section.maintenance">{{ m.maintenance_heading() }}</UiIconedRow>
    </template>
    <UiButton @click="ui.push(maintenanceSubpage, undefined)">{{ m.maintenance_open() }}</UiButton>
  </UiSettingRow>
</template>
