<script setup lang="ts">
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { SettingsUiService } from "@/settings";
import { icons } from "@/ui/icons";
import { manual } from "@/ui/manual";
import UiButton from "@/ui/UiButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { appearanceSubpage } from "./appearance-subpage";

const ui = useService(SettingsUiService);
</script>

<template>
  <!-- A link row like the maintenance block: the editor needs a page of its own for the preview. -->
  <UiSettingRow heading :help="manual.view.appearance">
    <template #name>
      <UiIconedRow :icon="icons.section.appearance">{{ m.calendar_appearance_section_title() }}</UiIconedRow>
    </template>
    <UiButton @click="ui.push(appearanceSubpage, undefined)">{{ m.calendar_appearance_open() }}</UiButton>
  </UiSettingRow>
</template>
