<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useModal } from "@/infrastructure/host/modals";
import UiButton from "@/ui/UiButton.vue";
import UiIcon from "@/ui/UiIcon.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import type { ToolbarItemDefinition } from "../define-toolbar-item";

const props = defineProps<{ definitions: readonly ToolbarItemDefinition[] }>();

interface Row {
  readonly key: string;
  readonly label: string;
  readonly icon?: string;
  readonly description?: string;
  readonly defaultConfig: unknown;
}

const rows = computed<readonly Row[]>(() => {
  const out: Row[] = [];
  for (const d of props.definitions) {
    if (d.presets && d.presets.length > 0) {
      for (const preset of d.presets) {
        out.push({
          key: d.key,
          label: preset.label,
          icon: d.icon,
          description: d.description,
          defaultConfig: preset.defaultConfig,
        });
      }
    } else {
      out.push({
        key: d.key,
        label: d.label,
        icon: d.icon,
        description: d.description,
        defaultConfig: d.defaultConfig,
      });
    }
  }
  return out;
});

const api = useModal<{ key: string; defaultConfig: unknown }>();
</script>

<template>
  <div>
    <UiSettingRow v-if="rows.length === 0">
      <template #description>{{ m.view_add_toolbar_item_empty() }}</template>
    </UiSettingRow>
    <UiSettingRow v-for="(row, idx) of rows" :key="`${row.key}::${idx}`">
      <template #name>
        <UiIcon v-if="row.icon" :name="row.icon" />
        <button
          type="button"
          class="picker-row"
          @click="api.submit({ key: row.key, defaultConfig: row.defaultConfig })"
        >
          {{ row.label }}
        </button>
      </template>
      <template v-if="row.description" #description>{{ row.description }}</template>
    </UiSettingRow>
    <UiSettingRow controls-only>
      <UiButton @click="api.cancel()">{{ m.common_action_cancel() }}</UiButton>
    </UiSettingRow>
  </div>
</template>

<style scoped>
.picker-row {
  background: none;
  border: 0;
  padding: 0;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
}
</style>
