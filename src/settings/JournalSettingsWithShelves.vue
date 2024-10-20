<script setup lang="ts">
import ObsidianSetting from "@/components/obsidian/ObsidianSetting.vue";
import ObsidianIconButton from "@/components/obsidian/ObsidianIconButton.vue";
import { VueModal } from "@/components/modals/vue-modal";
import CreateShelf from "@/components/modals/CreateShelf.modal.vue";
import RemoveShelf from "@/components/modals/RemoveShelf.modal.vue";
import { plugin$ } from "@/stores/obsidian.store";
import { pluginSettings$ } from "@/stores/settings.store";
import { computed } from "vue";
import JournalSettingsList from "./JournalSettingsList.vue";
import CreateJournalModal from "@/components/modals/CreateJournal.modal.vue";
import type { JournalSettings } from "@/types/settings.types";

const emit = defineEmits<{
  (event: "organize", shelfName: string): void;
  // eslint-disable-next-line @typescript-eslint/unified-signatures
  (event: "edit", journalName: string): void;
}>();

const shelvesList = computed(() =>
  Object.values(pluginSettings$.value.shelves).toSorted((a, b) => a.name.localeCompare(b.name)),
);
const journalsWithoutShelf = computed(() => {
  const journals = Object.values(pluginSettings$.value.journals);
  return journals.filter((journal) => journal.shelves.length === 0);
});

function createShelf(): void {
  new VueModal("Add Journal Shelf", CreateShelf, {
    onCreate(name: string) {
      plugin$.value.createShelf(name);
    },
  }).open();
}

function removeShelf(shelfName: string): void {
  const shelf = pluginSettings$.value.shelves[shelfName];
  if (!shelf) return;
  new VueModal(`Remove ${shelf.name} shelf`, RemoveShelf, {
    shelfName,
    onRemove(destinationShelf: string) {
      plugin$.value.removeShelf(shelfName, destinationShelf);
    },
  }).open();
}

function create(): void {
  new VueModal("Add Journal", CreateJournalModal, {
    onCreate(name: string, writing: JournalSettings["write"]) {
      plugin$.value.createJournal(name, writing);
      emit("edit", name);
    },
  }).open();
}
</script>

<template>
  <ObsidianSetting name="Journal shelves" heading>
    <ObsidianIconButton :icon="'plus'" cta tooltip="Create new shelf" @click="createShelf" />
  </ObsidianSetting>
  <p v-if="shelvesList.length === 0">No shelves configured yet.</p>
  <template v-else>
    <ObsidianSetting v-for="shelf of shelvesList" :key="shelf.name">
      <template #name>
        <b>
          {{ shelf.name }}
        </b>
        <br />
        {{ shelf.journals.length }} journals
      </template>
      <ObsidianIconButton icon="library" :tooltip="'Organize ' + shelf.name" @click="$emit('organize', shelf.name)" />
      <ObsidianIconButton icon="trash-2" :tooltip="'Delete ' + shelf.name" @click="removeShelf(shelf.name)" />
    </ObsidianSetting>
  </template>
  <ObsidianSetting name="Journals not on shelf" heading>
    <ObsidianIconButton icon="plus" cta tooltip="Create new journal" @click="create" />
  </ObsidianSetting>
  <JournalSettingsList :journals="journalsWithoutShelf" @edit="$emit('edit', $event)" />
</template>

<style scoped></style>
