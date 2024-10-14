<script setup lang="ts">
import ObsidianSetting from "@/components/obsidian/ObsidianSetting.vue";
import JournalSettingsList from "./JournalSettingsList.vue";
import ObsidianIconButton from "@/components/obsidian/ObsidianIconButton.vue";
import { VueModal } from "@/components/modals/vue-modal";
import CreateJournal from "@/components/modals/CreateJournal.modal.vue";
import RemoveJournal from "@/components/modals/RemoveJournal.modal.vue";
import { plugin$ } from "@/stores/obsidian.store";
import type { JournalSettings, NotesProcessing } from "@/types/settings.types";
import { journals$ } from "@/stores/settings.store";

const emit = defineEmits<(event: "edit", name: string) => void>();

function create(): void {
  new VueModal("Add Journal", CreateJournal, {
    onCreate(name: string, writing: JournalSettings["write"]) {
      plugin$.value.createJournal(name, writing);
    },
  }).open();
}
function edit(name: string): void {
  emit("edit", name);
}
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
  <ObsidianSetting name="Journals" heading>
    <ObsidianIconButton :icon="'plus'" cta tooltip="Create new journal" @click="create" />
  </ObsidianSetting>

  <JournalSettingsList @edit="edit" @remove="remove" />
</template>

<style scoped></style>
