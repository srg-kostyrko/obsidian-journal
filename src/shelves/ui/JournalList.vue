<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate } from "@/calendar";
import { m } from "@/i18n";
import { describeWrite, type JournalConfig } from "@/journals";
import { icons } from "@/ui/icons";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

const props = defineProps<{
  entries: readonly [string, JournalConfig][];
  emptyText: string;
}>();
defineEmits<{
  "bulk-add": [name: string];
  edit: [name: string];
  clone: [name: string];
  delete: [name: string];
}>();

// A display check only, never stored: it follows edits and sync merges through the settings store.
const unrenderable = computed(() => {
  const today = CalendarDate.today();
  return new Set(
    props.entries.filter(([, config]) => today.tryFormat(config.dateFormat).isErr()).map(([name]) => name),
  );
});
</script>

<template>
  <UiSettingRow v-if="entries.length === 0">
    <template #description>{{ emptyText }}</template>
  </UiSettingRow>
  <template v-else>
    <UiSettingRow v-for="[name, config] in entries" :key="name">
      <template #name>
        {{ name }}
        <span class="flair">{{ m.journal_write({ every: "day", duration: 1, ...describeWrite(config.write) }) }}</span>
      </template>
      <template v-if="unrenderable.has(name)" #description>
        <span class="journal-hint">{{ m.journal_dashboard_date_format_unrenderable() }}</span>
      </template>
      <UiIconButton
        :icon="icons.action.bulkAdd"
        :tooltip="m.journal_dashboard_bulk_add({ name })"
        @click="$emit('bulk-add', name)"
      />
      <UiIconButton
        :icon="icons.action.configure"
        :tooltip="m.journal_dashboard_edit({ name })"
        @click="$emit('edit', name)"
      />
      <UiIconButton
        :icon="icons.action.copy"
        :tooltip="m.journal_dashboard_clone({ name })"
        @click="$emit('clone', name)"
      />
      <UiIconButton
        :icon="icons.action.delete"
        :tooltip="m.common_delete_name({ name })"
        @click="$emit('delete', name)"
      />
    </UiSettingRow>
  </template>
</template>

<style scoped>
.journal-hint {
  color: var(--text-warning);
}
</style>
