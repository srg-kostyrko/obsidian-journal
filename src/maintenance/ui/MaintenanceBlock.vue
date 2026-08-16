<script setup lang="ts">
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { SettingsUiService } from "@/settings";
import UiButton from "@/ui/UiButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { maintenanceSubpage } from "./maintenance-subpage";

const ui = useService(SettingsUiService);
</script>

<template>
  <UiSettingRow heading :name="m.maintenance_heading()">
    <UiButton @click="ui.push(maintenanceSubpage, undefined)">{{ m.maintenance_open() }}</UiButton>
  </UiSettingRow>
</template>
