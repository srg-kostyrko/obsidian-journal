<script setup lang="ts">
import { computed } from "vue";
import ObsidianSetting from "@/components/obsidian/ObsidianSetting.vue";
import ObsidianIconButton from "@/components/obsidian/ObsidianIconButton.vue";
import { VueModal } from "@/components/modals/vue-modal";
import RenameShelfModal from "@/components/modals/RenameShelf.modal.vue";
import CreateJournal from "@/components/modals/CreateJournal.modal.vue";
import type { JournalSettings } from "@/types/settings.types";
import JournalSettingsList from "./JournalSettingsList.vue";
import { useApp } from "@/composables/use-app";
import { usePlugin } from "@/composables/use-plugin";
import type { Journal } from "@/journals/journal";

const { shelfName } = defineProps<{
  shelfName: string;
}>();
const emit = defineEmits<{
  (event: "back"): void;
  (event: "edit" | "organize" | "bulk-add", name: string): void;
}>();

const app = useApp();
const plugin = usePlugin();

const shelf = computed(() => plugin.getShelf(shelfName));
const shelfJournals = computed(() => {
  if (!shelf.value) return [];
  return (
    shelf.value.journals
      .map((name) => plugin.getJournal(name))
      // eslint-disable-next-line unicorn/prefer-native-coercion-functions
      .filter((journal): journal is Journal => Boolean(journal))
  );
});

function showRenameModal(): void {
  if (!shelf.value) return;
  new VueModal(app, plugin, "Rename shelf", RenameShelfModal, {
    name: shelf.value.name,
    onSave(name: string) {
      plugin.renameShelf(shelfName, name);
      emit("organize", name);
    },
  }).open();
}

function create(): void {
  new VueModal(app, plugin, "Add Journal", CreateJournal, {
    onCreate(name: string, writing: JournalSettings["write"]) {
      if (!shelf.value) return;
      const journal = plugin.createJournal(name, writing);
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

    <JournalSettingsList
      :journals="shelfJournals"
      @edit="$emit('edit', $event)"
      @bulk-add="$emit('bulk-add', $event)"
    />
  </div>
</template>

<style scoped></style>
