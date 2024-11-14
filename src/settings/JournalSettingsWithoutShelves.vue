<script setup lang="ts">
import ObsidianSetting from "@/components/obsidian/ObsidianSetting.vue";
import JournalSettingsList from "./JournalSettingsList.vue";
import ObsidianIconButton from "@/components/obsidian/ObsidianIconButton.vue";
import { VueModal } from "@/components/modals/vue-modal";
import CreateJournal from "@/components/modals/CreateJournal.modal.vue";
import { plugin$ } from "@/stores/obsidian.store";
import type { JournalSettings } from "@/types/settings.types";
import { journalsList$ } from "@/stores/settings.store";

defineEmits<(event: "edit" | "bulk-add", name: string) => void>();

function create(): void {
  new VueModal("Add Journal", CreateJournal, {
    onCreate(name: string, writing: JournalSettings["write"]) {
      plugin$.value.createJournal(name, writing);
    },
  }).open();
}
</script>

<template>
  <ObsidianSetting name="Journals" heading>
    <ObsidianIconButton icon="plus" cta tooltip="Create new journal" @click="create" />
  </ObsidianSetting>

  <JournalSettingsList :journals="journalsList$" @edit="$emit('edit', $event)" @bulk-add="$emit('bulk-add', $event)" />
</template>

<style scoped></style>
