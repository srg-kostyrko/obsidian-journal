<script setup lang="ts">
import { computed } from "vue";
import ObsidianSetting from "../components/obsidian/ObsidianSetting.vue";
import ObsidianIconButton from "../components/obsidian/ObsidianIconButton.vue";
import type { JournalSettings, NotesProcessing } from "@/types/settings.types";
import { VueModal } from "@/components/modals/vue-modal";
import RemoveJournal from "@/components/modals/RemoveJournal.modal.vue";
import { plugin$ } from "@/stores/obsidian.store";
import { journals$ } from "@/stores/settings.store";

const { journals } = defineProps<{
  journals: JournalSettings[];
}>();

defineEmits<(event: "edit", name: string) => void>();

const journalsList = computed(() => Object.values(journals).toSorted((a, b) => a.name.localeCompare(b.name)));

function remove(name: string): void {
  const journal = journals$.value[name];
  if (!journal) return;
  new VueModal(`Remove ${journal.name} journal`, RemoveJournal, {
    onRemove(_noteProcessing: NotesProcessing) {
      // TODO Process notes on remove
      plugin$.value.removeJournal(name);
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
      <ObsidianIconButton icon="pencil" :tooltip="'Edit ' + journal.name" @click="$emit('edit', journal.name)" />
      <ObsidianIconButton icon="trash-2" :tooltip="'Delete ' + journal.name" @click="remove(journal.name)" />
    </ObsidianSetting>
  </template>
</template>
