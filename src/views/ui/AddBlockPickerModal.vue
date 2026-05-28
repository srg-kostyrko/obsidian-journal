<script setup lang="ts">
import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiIcon from "@/ui/UiIcon.vue";
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
        <UiIcon v-if="d.icon" :name="d.icon" />
        <button type="button" class="block-picker-row" @click="api.submit(d.key)">{{ d.label }}</button>
      </template>
      <template v-if="d.description" #description>{{ d.description }}</template>
    </UiSettingRow>

    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
    </UiSettingRow>
  </div>
</template>

<style scoped>
.block-picker-row {
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
}
</style>
