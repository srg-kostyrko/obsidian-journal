<script setup lang="ts">
import { m } from "@/i18n";
import type { JournalWrite } from "@/journals";
import UiIconButton from "@/ui/UiIconButton.vue";
import UiSettingRow from "@/ui/UiSettingRow.vue";

import { commandTypeLabel } from "./command-type-label";

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
      </template>
      <UiIconButton icon="pencil" :tooltip="`${m.command_list_edit()} ${command.name}`" @click="$emit('edit', id)" />
      <UiIconButton
        icon="trash-2"
        :tooltip="`${m.command_list_delete()} ${command.name}`"
        @click="$emit('delete', id)"
      />
    </UiSettingRow>
  </template>
</template>
