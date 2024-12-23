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
}));

const resolvedPath = computed(() => {
  if (!journal.value) return "";
  return journal.value.getConfiguredPathData(metadata.value)[0];
});
</script>

<template>
  <div>
    Folder with resolved variables: <b class="u-pop"> {{ resolvedPath }}</b>
  </div>
</template>

<style scoped></style>
