<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { EmptyNoteNameError, NotePathService } from "@/journals";

import { useTodayMetadata } from "./use-today-metadata";

const { journalName } = defineProps<{ journalName: string }>();

const pathSvc = useService(NotePathService);
const metadata = useTodayMetadata(journalName);

type Resolved = { kind: "path"; path: string } | { kind: "empty" } | undefined;

const resolved = computed<Resolved>(() => {
  const md = metadata.value;
  if (!md) return;
  const result = pathSvc.pathFor(journalName, md);
  if (result.isErr()) {
    return result.error instanceof EmptyNoteNameError ? { kind: "empty" } : undefined;
  }
  return { kind: "path", path: result.value };
});
</script>

<template>
  <div v-if="resolved?.kind === 'empty'" class="note-path-preview journal-hint">
    {{ m.journal_edit_name_template_empty_warning() }}
  </div>
  <div v-else-if="resolved?.kind === 'path'" class="note-path-preview">
    {{ m.journal_edit_note_path_preview_label() }}
    <b class="u-pop">{{ resolved.path }}</b>
  </div>
</template>

<style scoped>
.note-path-preview {
  padding-bottom: var(--size-4-2);
}
.journal-hint {
  color: var(--text-warning);
}
/* Preserve significant whitespace in a resolved path so spaces render literally. */
b {
  white-space: pre;
}
</style>
