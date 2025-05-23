<script setup lang="ts">
import { today } from "@/calendar";
import { usePlugin } from "@/composables/use-plugin";
import { JournalAnchorDate, type JournalMetadata } from "@/types/journal.types";
import { computed } from "vue";
import WrongWeekWarning from "./WrongWeekWarning.vue";
import { buildDateVariableRegexp } from "@/utils/template";

const { journalName, path } = defineProps<{
  path: string;
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
  return journal.value.getResolvedTemplatePath(path, metadata.value);
});
const hasWongWeekFormat = computed(() => {
  const regexp = buildDateVariableRegexp("(.*?)");
  return [...path.matchAll(regexp)].some((match) => match.groups?.format?.replaceAll(/\[.*?\]/gi, "").includes("W"));
});
</script>

<template>
  <div class="path-hint">
    Template path with resolved variables: <b class="u-pop"> {{ resolvedPath }}</b>
    <WrongWeekWarning v-if="hasWongWeekFormat" />
  </div>
</template>

<style scoped>
.path-hint {
  padding: var(--size-2-2);
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
  line-height: var(--line-height-tight);
}
</style>
