<script setup lang="ts">
import { computed } from "vue";
import ObsidianSetting from "../components/obsidian/ObsidianSetting.vue";
import ObsidianIconButton from "../components/obsidian/ObsidianIconButton.vue";
import type { JournalSettings, NotesProcessing } from "@/types/settings.types";
import { VueModal } from "@/components/modals/vue-modal";
import RemoveJournal from "@/components/modals/RemoveJournal.modal.vue";
import { journals$ } from "@/stores/settings.store";
import { useApp } from "@/composables/use-app";
import { usePlugin } from "@/composables/use-plugin";

const { journals } = defineProps<{
  journals: JournalSettings[];
}>();

defineEmits<(event: "edit" | "bulk-add", name: string) => void>();

const app = useApp();
const plugin = usePlugin();

const journalsList = computed(() => Object.values(journals).toSorted((a, b) => a.name.localeCompare(b.name)));

function remove(name: string): void {
  const journal = journals$.value[name];
  if (!journal) return;
  new VueModal(app, plugin, `Remove ${journal.name} journal`, RemoveJournal, {
    onRemove(_noteProcessing: NotesProcessing) {
      // TODO Process notes on remove
      plugin.removeJournal(name);
    },
  }).open();
}
</script>

<template>
  <p v-if="journalsList.length === 0">No journals configured yet.</p>
  <template v-else>
    <ObsidianSetting v-for="journal of journalsList" :key="journal.name">
      <template #name>
        {{ journal.name }}
        <span class="flair">{{ journal.write.type }}</span>
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
