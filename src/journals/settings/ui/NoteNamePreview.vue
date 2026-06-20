<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { NotePathService } from "@/journals";

import { useTodayMetadata } from "./use-today-metadata";

const { journalName } = defineProps<{ journalName: string }>();

const path = useService(NotePathService);
const metadata = useTodayMetadata(journalName);

const basename = computed(() => {
  const md = metadata.value;
  if (!md) return "";
  const result = path.pathFor(journalName, md);
  if (!result.isOk()) return "";
  const filename = result.value.split("/").pop() ?? result.value;
  return filename.replace(/\.md$/, "");
});
</script>

<template>
  <div v-if="basename">
    {{ m.journal_edit_note_name_preview_label() }}
    <b class="u-pop">{{ basename }}</b>
  </div>
</template>

<style scoped>
/* Preserve significant whitespace in a resolved filename so spaces render literally. */
b {
  white-space: pre;
}
</style>
