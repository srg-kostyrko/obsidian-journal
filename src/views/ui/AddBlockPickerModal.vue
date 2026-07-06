<script setup lang="ts">
import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import { icons } from "@/ui/icons";
import UiButton from "@/ui/UiButton.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiIconedRow from "@/ui/UiIconedRow.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import type { ViewBlockDefinition } from "../define-view-block";

defineProps<{ definitions: readonly ViewBlockDefinition[] }>();

const api = useModal<string>();
</script>

<template>
  <div>
    <UiSettingRow v-if="definitions.length === 0">
      <template #description>{{ m.view_add_block_empty() }}</template>
    </UiSettingRow>
    <UiSettingRow v-for="d of definitions" :key="d.key">
      <template #name>
        <UiIconedRow v-if="d.icon" :icon="d.icon">{{ d.label }}</UiIconedRow>
        <template v-else>{{ d.label }}</template>
      </template>
      <template v-if="d.description" #description>{{ d.description }}</template>
      <UiIconButton
        :icon="icons.action.add"
        :tooltip="m.view_add_picker_action({ label: d.label })"
        @click="api.submit(d.key)"
      />
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
    </UiSettingRow>
  </div>
</template>
