<script setup lang="ts">
import { m } from "@/i18n";
import { describeWrite, type JournalConfig } from "@/journals";
import { icons } from "@/ui/icons";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

defineProps<{
  entries: readonly [string, JournalConfig][];
  emptyText: string;
}>();
defineEmits<{
  "bulk-add": [name: string];
  edit: [name: string];
  duplicate: [name: string];
  delete: [name: string];
}>();
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
        :tooltip="m.journal_dashboard_duplicate({ name })"
        @click="$emit('duplicate', name)"
      />
      <UiIconButton
        :icon="icons.action.delete"
        :tooltip="m.common_delete_name({ name })"
        @click="$emit('delete', name)"
      />
    </UiSettingRow>
  </template>
</template>
