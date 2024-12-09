<script setup lang="ts">
import ObsidianSetting from "@/components/obsidian/ObsidianSetting.vue";
import ObsidianIconButton from "@/components/obsidian/ObsidianIconButton.vue";
import { VueModal } from "@/components/modals/vue-modal";
import CreateShelf from "@/components/modals/CreateShelf.modal.vue";
import RemoveShelf from "@/components/modals/RemoveShelf.modal.vue";
import { computed } from "vue";
import JournalSettingsList from "./JournalSettingsList.vue";
import CreateJournalModal from "@/components/modals/CreateJournal.modal.vue";
import type { JournalSettings } from "@/types/settings.types";
import { usePlugin } from "@/composables/use-plugin";
import CollapsibleBlock from "@/components/CollapsibleBlock.vue";

const emit = defineEmits<{
  (event: "organize", shelfName: string): void;
  // eslint-disable-next-line @typescript-eslint/unified-signatures
  (event: "edit" | "bulk-add", journalName: string): void;
}>();

const plugin = usePlugin();

const journalsWithoutShelf = computed(() => {
  return plugin.journals.filter((journal) => !journal.isOnShelf);
});

function createShelf(): void {
  new VueModal(plugin, "Add Journal Shelf", CreateShelf, {
    onCreate(name: string) {
      plugin.createShelf(name);
    },
  }).open();
}

function removeShelf(shelfName: string): void {
  new VueModal(plugin, `Remove ${shelfName} shelf`, RemoveShelf, {
    shelfName,
    onRemove(destinationShelf: string) {
      plugin.removeShelf(shelfName, destinationShelf);
    },
  }).open();
}

function create(): void {
  new VueModal(plugin, "Add Journal", CreateJournalModal, {
    onCreate(name: string, writing: JournalSettings["write"]) {
      plugin.createJournal(name, writing);
      emit("edit", name);
    },
  }).open();
}
</script>

<template>
  <CollapsibleBlock>
    <template #trigger>
      Journal shelves <span class="flair">{{ plugin.shelves.length }}</span>
    </template>
    <template #controls>
      <ObsidianIconButton :icon="'plus'" cta tooltip="Create new shelf" @click="createShelf" />
    </template>
    <ObsidianSetting v-if="plugin.shelves.length === 0">
      <template #description> No shelves configured yet. </template>
    </ObsidianSetting>

    <template v-else>
      <ObsidianSetting v-for="shelf of plugin.shelves" :key="shelf.name">
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
  </CollapsibleBlock>
  <CollapsibleBlock>
    <template #trigger>
      Journals not on shelf <span class="flair">{{ journalsWithoutShelf.length }}</span>
    </template>
    <template #controls>
      <ObsidianIconButton icon="plus" cta tooltip="Create new journal" @click="create" />
    </template>
    <JournalSettingsList
      :journals="journalsWithoutShelf"
      @edit="$emit('edit', $event)"
      @bulk-add="$emit('bulk-add', $event)"
    />
  </CollapsibleBlock>
</template>

<style scoped></style>
