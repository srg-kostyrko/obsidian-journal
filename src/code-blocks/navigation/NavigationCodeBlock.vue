<script setup lang="ts">
import { usePathData } from "@/composables/use-path-data";
import { pluginSettings$ } from "@/stores/settings.store";
import { computed } from "vue";
import NavigationBlock from "./NavigationBlock.vue";
import type { JournalMetadata } from "@/types/journal.types";
import ObsidianIconButton from "@/components/obsidian/ObsidianIconButton.vue";
import { usePlugin } from "@/composables/use-plugin";

const props = defineProps<{
  path: string;
}>();

const plugin = usePlugin();
const noteData = usePathData(props.path);

const journalSettings = computed(() => {
  if (!noteData.value) return null;
  return pluginSettings$.value.journals[noteData.value.journal];
});
const shouldNavigateExisting = computed(() => {
  if (!journalSettings.value) return false;
  return journalSettings.value.navBlock.type === "existing";
});

const journal = computed(() => {
  if (!noteData.value) return null;
  return plugin.getJournal(noteData.value.journal);
});
const nextMetadata = computed<JournalMetadata | null>(() => {
  if (!noteData.value || !journal.value) return null;
  return journal.value.next(noteData.value.date, shouldNavigateExisting.value);
});
const previousMetadata = computed<JournalMetadata | null>(() => {
  if (!noteData.value || !journal.value) return null;
  return journal.value.previous(noteData.value.date, shouldNavigateExisting.value);
});
</script>

<template>
  <div v-if="noteData" class="nav-view">
    <div v-if="previousMetadata" class="nav-block-relative">
      <NavigationBlock :ref-date="previousMetadata.date" :journal-name="noteData.journal" />
      <ObsidianIconButton icon="arrow-left" class="nav-prev" />
    </div>
    <NavigationBlock :ref-date="noteData.date" :journal-name="noteData.journal" />
    <div v-if="nextMetadata" class="nav-block-relative">
      <ObsidianIconButton icon="arrow-right" class="nav-next" />
      <NavigationBlock :ref-date="nextMetadata.date" :journal-name="noteData.journal" />
    </div>
  </div>
  <div v-else>Note is not connected to a journal</div>
</template>

<style scoped>
.nav-view {
  display: flex;
  justify-content: space-around;
  --icon-size: 3em;
}
.nav-block-relative {
  position: relative;
  font-size: 0.8em;
  margin-top: 0.5em;
}
.nav-prev {
  position: absolute;
  right: -8em;
  top: 30%;
}
.nav-next {
  position: absolute;
  left: -8em;
  top: 30%;
}
</style>
