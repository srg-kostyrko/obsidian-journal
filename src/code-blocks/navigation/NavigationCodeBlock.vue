<script setup lang="ts">
import { usePathData } from "@/composables/use-path-data";
import { pluginSettings$ } from "@/stores/settings.store";
import { computed, ref, watchEffect } from "vue";
import NavigationBlock from "./NavigationBlock.vue";
import { plugin$ } from "@/stores/obsidian.store";
import type { JournalMetadata } from "@/types/journal.types";
import ObsidianIconButton from "@/components/obsidian/ObsidianIconButton.vue";

const props = defineProps<{
  path: string;
}>();

const noteData = usePathData(props.path);
const previousMetadata = ref<JournalMetadata | null>(null);
const nextMetadata = ref<JournalMetadata | null>(null);

const journalSettings = computed(() => {
  if (!noteData.value) return null;
  return pluginSettings$.value.journals[noteData.value.journal];
});

watchEffect(async () => {
  if (!noteData.value) return;
  const journal = plugin$.value.getJournal(noteData.value.journal);
  if (!journal) return;
  const anchorDate = journal.resolveAnchorDate(noteData.value.date);
  if (!anchorDate) return;
  const existing = journalSettings.value?.navBlock.type === "existing";
  nextMetadata.value = await journal.next(anchorDate, existing);
  previousMetadata.value = await journal.previous(anchorDate, existing);
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
