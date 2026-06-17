<script setup lang="ts">
import { m } from "@/i18n";
import type { JournalWrite } from "@/journals";
import { icons } from "@/ui/icons";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { commandContextLabel, commandTypeLabel } from "./command-type-label";

import type { CommandConfig } from "../config";

defineProps<{
  entries: readonly [string, CommandConfig, JournalWrite["type"]][];
  emptyText: string;
}>();
defineEmits<{ edit: [id: string]; delete: [id: string] }>();
</script>

<template>
  <UiSettingRow v-if="entries.length === 0">
    <template #description>{{ emptyText }}</template>
  </UiSettingRow>
  <template v-else>
    <UiSettingRow v-for="[id, command, writeType] in entries" :key="id">
      <template #name>
        {{ command.name }}
        <span class="flair">{{ commandTypeLabel(writeType, command.type, command.context) }}</span>
        <span v-if="commandContextLabel(command.context)" class="command-context">
          {{ commandContextLabel(command.context) }}
        </span>
      </template>
      <UiIconButton
        :icon="icons.action.edit"
        :tooltip="`${m.command_edit()} ${command.name}`"
        @click="$emit('edit', id)"
      />
      <UiIconButton
        :icon="icons.action.delete"
        :tooltip="`${m.command_delete()} ${command.name}`"
        @click="$emit('delete', id)"
      />
    </UiSettingRow>
  </template>
</template>

<style scoped>
.command-context {
  color: var(--text-muted);
}
</style>
