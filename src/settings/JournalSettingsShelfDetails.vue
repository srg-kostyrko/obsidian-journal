<script setup lang="ts">
import { pluginSettings$ } from "@/stores/settings.store";
import { computed } from "vue";
import ObsidianSetting from "@/components/obsidian/ObsidianSetting.vue";
import ObsidianIconButton from "@/components/obsidian/ObsidianIconButton.vue";
import { VueModal } from "@/components/modals/vue-modal";
import { plugin$ } from "@/stores/obsidian.store";
import RenameShelfModal from "@/components/modals/RenameShelf.modal.vue";
import CreateJournal from "@/components/modals/CreateJournal.modal.vue";
import type { JournalSettings } from "@/types/settings.types";
import JournalSettingsList from "./JournalSettingsList.vue";

const { shelfName } = defineProps<{
  shelfName: string;
}>();
const emit = defineEmits<{
  (event: "back"): void;
  (event: "edit" | "organize", name: string): void;
}>();

const shelf = computed(() => pluginSettings$.value.shelves[shelfName]);
const shelfJournals = computed(() => {
  if (!shelf.value) return [];
  return shelf.value.journals.map((journalName) => pluginSettings$.value.journals[journalName]);
});

function showRenameModal(): void {
  new VueModal("Rename shelf", RenameShelfModal, {
    name: shelf.value.name,
    onSave(name: string) {
      plugin$.value.renameShelf(shelfName, name);
      emit("organize", name);
    },
  }).open();
}

function create(): void {
  new VueModal("Add Journal", CreateJournal, {
    onCreate(name: string, writing: JournalSettings["write"]) {
      const journal = plugin$.value.createJournal(name, writing);
      shelf.value.journals.push(name);
      journal.shelves.push(shelfName);

      emit("edit", name);
    },
  }).open();
}
</script>

<template>
  <div v-if="shelf">
    <ObsidianSetting heading>
      <template #name> Configuring {{ shelf.name }} </template>
      <ObsidianIconButton icon="pencil" tooltip="Rename shelf" @click="showRenameModal" />
      <ObsidianIconButton icon="chevron-left" tooltip="Back to list" @click="$emit('back')" />
    </ObsidianSetting>

    <ObsidianSetting name="Journals" heading>
      <ObsidianIconButton icon="plus" cta tooltip="Create new journal" @click="create" />
    </ObsidianSetting>

    <JournalSettingsList :journals="shelfJournals" @edit="$emit('edit', $event)" />
  </div>
</template>

<style scoped></style>
