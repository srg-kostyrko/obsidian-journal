<script setup lang="ts">
import { computed, ref } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { Flows } from "@/infrastructure/flows";
import { SettingsService } from "@/settings";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiCollapsibleBlock from "@/ui/UiCollapsibleBlock.vue";
import UiDropdown from "@/ui/UiDropdown.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { DumpLogsFlow } from "../../flows/dump-logs.flow";
import { loggingSlice, type LoggingSliceState } from "../slice";

const settings = useService(SettingsService);
const flows = useService(Flows);
const slice = settings.getSlice(loggingSlice);
const expanded = ref(false);

const level = computed({
  get: (): LoggingSliceState["level"] => slice.state.level,
  set: (value: string) => {
    slice.state = { ...slice.state, level: value as LoggingSliceState["level"] };
  },
});

function dump(): void {
  // DumpLogsFlow shows its own empty/failed/succeeded notices.
  void flows.invoke(DumpLogsFlow, undefined, { notify: false });
}
</script>

<template>
  <UiCollapsibleBlock v-model:expanded="expanded">
    <template #trigger>
      <span class="section-heading">
        <UiIcon :name="icons.section.logging" />
        <span class="section-title">{{ m.logging_section_title() }}</span>
      </span>
    </template>
    <UiSettingRow :name="m.logging_level_title()">
      <template #description>{{ m.logging_level_desc() }}</template>
      <UiDropdown v-model="level">
        <option value="debug">{{ m.logging_level_debug() }}</option>
        <option value="info">{{ m.logging_level_info() }}</option>
        <option value="warn">{{ m.logging_level_warn() }}</option>
        <option value="error">{{ m.logging_level_error() }}</option>
      </UiDropdown>
    </UiSettingRow>
    <UiSettingRow :name="m.logging_dump_title()">
      <template #description>{{ m.logging_dump_desc() }}</template>
      <UiButton @click="dump">{{ m.logging_dump_button() }}</UiButton>
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
