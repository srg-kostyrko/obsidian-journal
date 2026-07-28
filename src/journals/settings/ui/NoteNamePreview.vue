<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { EmptyNoteNameError, NotePathService } from "@/journals";

import { useTodayMetadata } from "./use-today-metadata";

const { journalName } = defineProps<{ journalName: string }>();

const path = useService(NotePathService);
const metadata = useTodayMetadata(journalName);

type Resolved = { kind: "name"; basename: string } | { kind: "empty" } | undefined;

const resolved = computed<Resolved>(() => {
  const md = metadata.value;
  if (!md) return;
  const result = path.pathFor(journalName, md);
  if (result.isErr()) {
    return result.error instanceof EmptyNoteNameError ? { kind: "empty" } : undefined;
  }
  const filename = result.value.split("/").pop() ?? result.value;
  return { kind: "name", basename: filename.replace(/\.md$/, "") };
});
</script>

<template>
  <div v-if="resolved?.kind === 'empty'" class="journal-hint">
    {{ m.journal_edit_name_template_empty_warning() }}
  </div>
  <div v-else-if="resolved?.kind === 'name'">
    {{ m.journal_edit_note_name_preview_label() }}
    <b class="u-pop">{{ resolved.basename }}</b>
  </div>
</template>

<style scoped>
.journal-hint {
  color: var(--text-warning);
}
/* Preserve significant whitespace in a resolved filename so spaces render literally. */
b {
  white-space: pre;
}
</style>
