<script setup lang="ts">
import { usePathData } from "@/composables/use-path-data";
import { computed } from "vue";
import NavigationBlock from "./NavigationBlock.vue";
import type { JournalMetadata } from "@/types/journal.types";
import ObsidianIconButton from "@/components/obsidian/ObsidianIconButton.vue";
import { usePlugin } from "@/composables/use-plugin";
import { openDateInJournal } from "@/journals/open-date";

const props = defineProps<{
  path: string;
  preventNavigation?: boolean;
}>();

const plugin = usePlugin();
const noteData = usePathData(props.path);

const journal = computed(() => {
  if (!noteData.value) return null;
  return plugin.getJournal(noteData.value.journal);
});
const nextMetadata = computed<JournalMetadata | null>(() => {
  if (!noteData.value || !journal.value) return null;
  const shouldNavigateExisting = journal.value.navBlock.type === "existing";
  return journal.value.next(noteData.value.date, shouldNavigateExisting);
});
const previousMetadata = computed<JournalMetadata | null>(() => {
  if (!noteData.value || !journal.value) return null;
  const shouldNavigateExisting = journal.value.navBlock.type === "existing";
  return journal.value.previous(noteData.value.date, shouldNavigateExisting);
});

function open(metadata: JournalMetadata) {
  if (props.preventNavigation) return;
  openDateInJournal(plugin, metadata.date, metadata.journal).catch(console.error);
}
</script>

<template>
  <div v-if="noteData && journal" class="nav-view">
    <div v-if="previousMetadata" class="nav-block-relative">
      <NavigationBlock
        :rows="journal.navBlock.rows"
        :ref-date="previousMetadata.date"
        :journal-name="noteData.journal"
        :prevent-navigation
      />
      <ObsidianIconButton icon="arrow-left" class="nav-prev" @click="open(previousMetadata)" />
    </div>
    <div v-else class="nav-block-relative"></div>
    <NavigationBlock
      :rows="journal.navBlock.rows"
      class="nav-block"
      :ref-date="noteData.date"
      :journal-name="noteData.journal"
      :prevent-navigation
    />
    <div v-if="nextMetadata" class="nav-block-relative">
      <ObsidianIconButton icon="arrow-right" class="nav-next" @click="open(nextMetadata)" />
      <NavigationBlock
        :rows="journal.navBlock.rows"
        :ref-date="nextMetadata.date"
        :journal-name="noteData.journal"
        :prevent-navigation
      />
    </div>
    <div v-else class="nav-block-relative"></div>
  </div>
  <div v-else>Note is not connected to a journal</div>
</template>

<style scoped>
.nav-view {
  display: flex;
  justify-content: space-around;
  gap: 50px;
  --icon-size: 3em;
}
.nav-block {
  flex-basis: 30%;
}
.nav-block-relative {
  flex-basis: 30%;
  position: relative;
  font-size: 0.8em;
  margin-top: 0.5em;
}
.nav-prev {
  position: absolute;
  right: -50px;
  top: 30%;
}
.nav-next {
  position: absolute;
  left: -50px;
  top: 30%;
}
</style>
