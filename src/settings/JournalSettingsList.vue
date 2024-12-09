<script setup lang="ts">
import ObsidianSetting from "../components/obsidian/ObsidianSetting.vue";
import ObsidianIconButton from "../components/obsidian/ObsidianIconButton.vue";
import type { NotesProcessing } from "@/types/settings.types";
import { VueModal } from "@/components/modals/vue-modal";
import RemoveJournal from "@/components/modals/RemoveJournal.modal.vue";
import { usePlugin } from "@/composables/use-plugin";
import type { Journal } from "@/journals/journal";

const { journals } = defineProps<{
  journals: Journal[];
}>();

defineEmits<(event: "edit" | "bulk-add", name: string) => void>();

const plugin = usePlugin();

function remove(name: string): void {
  new VueModal(plugin, `Remove ${name} journal`, RemoveJournal, {
    onRemove(_noteProcessing: NotesProcessing) {
      // TODO Process notes on remove
      plugin.removeJournal(name);
    },
  }).open();
}
</script>

<template>
  <ObsidianSetting v-if="journals.length === 0">
    <template #description> No journals created yet. </template>
  </ObsidianSetting>
  <template v-else>
    <ObsidianSetting v-for="journal of journals" :key="journal.name">
      <template #name>
        {{ journal.name }}
        <span class="flair">{{ journal.type }}</span>
      </template>
      <ObsidianIconButton
        icon="import"
        :tooltip="'Add existing notes to ' + journal.name"
        @click="$emit('bulk-add', journal.name)"
      />
      <ObsidianIconButton icon="pencil" :tooltip="'Edit ' + journal.name" @click="$emit('edit', journal.name)" />
      <ObsidianIconButton icon="trash-2" :tooltip="'Delete ' + journal.name" @click="remove(journal.name)" />
    </ObsidianSetting>
  </template>
</template>
