<script setup lang="ts">
import { computed } from "vue";

import { CalendarDate } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { CycleService } from "@/journals/cycle";
import { FrontmatterService } from "@/journals/frontmatter";
import { NotePathService } from "@/journals/notes/note-path";
import { useIndexVersion } from "@/journals/use-index-version";
import { JournalsViewModel } from "@/journals/view-model";

const { journalName } = defineProps<{ journalName: string }>();

const journalsVM = useService(JournalsViewModel);
const cycle = useService(CycleService);
const frontmatter = useService(FrontmatterService);
const paths = useService(NotePathService);
// Numbering reads JournalsIndex for its basis, and the index is not Vue-reactive.
const indexVersion = useIndexVersion();

const PREVIEW_LENGTH = 5;

// Rendered through buildMetadata -> pathFor rather than pathForDate: the latter re-derives
// the anchor on every step, which is quadratic on a custom-interval journal.
const notePaths = computed<readonly string[]>(() => {
  void indexVersion.value;
  const config = journalsVM.getJournal(journalName).getOrUndefined();
  if (!config || !config.numbering.enabled || config.numbering.sources.length === 0) return [];
  const anchorOpt = cycle.anchorOf(journalName, CalendarDate.today());
  if (anchorOpt.isNone()) return [];

  const rendered: string[] = [];
  for (let step = 0; step < PREVIEW_LENGTH; step++) {
    const stepAnchor = cycle.anchorAtOffset(journalName, anchorOpt.value, step);
    if (stepAnchor.isNone()) break;
    const metadata = frontmatter.buildMetadata(journalName, stepAnchor.value);
    if (metadata.isErr()) break;
    const path = paths.pathFor(journalName, metadata.value);
    if (path.isErr()) break;
    rendered.push(path.value);
  }
  return rendered;
});
</script>

<template>
  <div v-if="notePaths.length > 0" class="sequence-preview">
    <div class="sequence-preview__label">{{ m.journal_sequence_preview_label() }}</div>
    <div v-for="(notePath, i) of notePaths" :key="i" class="sequence-preview__path">{{ notePath }}</div>
  </div>
</template>

<style scoped>
.sequence-preview {
  padding: var(--size-4-2) var(--size-4-3);
  border-radius: var(--radius-s);
  background: var(--background-secondary);
}
.sequence-preview__label {
  font-size: var(--font-ui-smaller);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-faint);
}
.sequence-preview__path {
  font-family: var(--font-monospace);
  font-size: var(--font-ui-small);
  /* Preserve significant whitespace so a template rendering spaces reads literally,
     while still letting a deep path wrap instead of overflowing the pane. */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
