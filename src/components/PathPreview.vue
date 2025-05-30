<script setup lang="ts">
import { today } from "@/calendar";
import { usePlugin } from "@/composables/use-plugin";
import { JournalAnchorDate, type JournalMetadata } from "@/types/journal.types";
import { computed } from "vue";
import WrongWeekWarning from "./WrongWeekWarning.vue";
import { buildDateVariableRegexp } from "@/utils/template";

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
  return journal.value.getConfiguredPathData(metadata.value)[0] + "/";
});
const hasWongWeekFormat = computed(() => {
  const folder = journal.value?.config.value.folder;
  if (!folder) return false;
  const regexp = buildDateVariableRegexp("(.*?)");
  return [...folder.matchAll(regexp)].some((match) => match.groups?.format?.replaceAll(/\[.*?\]/gi, "").includes("W"));
});
</script>

<template>
  <div>
    Folder with resolved variables: <b class="u-pop path-preview"> {{ resolvedPath }}</b>
    <WrongWeekWarning v-if="hasWongWeekFormat" />
  </div>
</template>

<style scoped>
.path-preview {
  white-space: pre;
}
</style>
