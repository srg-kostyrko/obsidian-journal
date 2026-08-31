<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import type { VaultPath } from "@/infrastructure/host";
import type { Result } from "@/infrastructure/result";

import { NoteletPathService } from "../../notelets/notelet-path";
import { EmptyNoteNameError } from "../../notes/errors";
import { NotePathService } from "../../notes/note-path";
import { JournalsViewModel } from "../../view-model";

import { useTodayMetadata } from "./use-today-metadata";

import type { JournalNotFoundError } from "../../errors";
import type { TypeId } from "../../notelets/config";

const props = withDefaults(defineProps<{ journalName: string; typeId?: string }>(), { typeId: undefined });

const pathSvc = useService(NotePathService);
const noteletPaths = useService(NoteletPathService);
const journalsVM = useService(JournalsViewModel);
const metadata = useTodayMetadata(props.journalName);

type Resolved = { kind: "path"; path: string } | { kind: "empty" } | undefined;

// A type previews the path it would actually take, suffixes and all — the same call creation
// makes, so a name template that collides shows the number the note would really get.
function noteletPath(typeId: string): Result<VaultPath, JournalNotFoundError | EmptyNoteNameError> | undefined {
  const md = metadata.value;
  const config = journalsVM.getJournal(props.journalName).getOrUndefined();
  const type = config?.notelets[typeId];
  if (!md || !config || !type) return;
  return noteletPaths.availablePathFor(config, type, {
    kind: "notelet",
    journalName: config.name,
    anchor: md.anchor,
    typeId: typeId as TypeId,
  });
}

const resolved = computed<Resolved>(() => {
  const md = metadata.value;
  if (!md) return;
  const result = props.typeId === undefined ? pathSvc.pathFor(props.journalName, md) : noteletPath(props.typeId);
  if (!result) return;
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
/* Preserve significant whitespace in a resolved path so spaces render literally,
   while still letting a deep path wrap instead of overflowing the pane. */
b {
  white-space: pre-wrap;
  overflow-wrap: anywhere; /* a single long segment has no space to break at */
}
</style>
