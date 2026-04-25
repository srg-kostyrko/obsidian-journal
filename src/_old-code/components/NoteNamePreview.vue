<script setup lang="ts">
import { today } from "@/calendar";
import { usePlugin } from "@/composables/use-plugin";
import { JournalAnchorDate, type JournalMetadata } from "@/types/journal.types";
import { computed } from "vue";

const { journalName } = defineProps<{
  journalName: string;
}>();

const plugin = usePlugin();
const journal = computed(() => plugin.getJournal(journalName));
const metadata = computed<JournalMetadata>(() => ({
  journal: journalName,
  date: JournalAnchorDate(today().format("YYYY-MM-DD")),
  index: 1,
}));

const resolvedName = computed(() => {
  if (!journal.value) return "";
  return journal.value.getConfiguredPathData(metadata.value)[1];
});
</script>

<template>
  <div>
    Note name with resolved variables will look like: <b class="u-pop name-preview"> {{ resolvedName }}</b>
  </div>
</template>

<style scoped>
.name-preview {
  white-space: pre;
}
</style>
