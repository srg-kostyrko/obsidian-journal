<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { isBenignFlowError } from "@/infrastructure/flows";
import { defineOpenMode, NoticeService, WorkspaceService } from "@/infrastructure/host";
import UiMarkdown from "@/ui/UiMarkdown.vue";

import { TickService } from "../tick";

import { checkboxTarget } from "./task-row-click";
import { unwrapLine } from "./unwrap-line";

import type { TaskListingRow } from "../listing";

const props = defineProps<{ row: TaskListingRow }>();

const tick = useService(TickService);
const notices = useService(NoticeService);
const workspace = useService(WorkspaceService);

// No provider emits a "note"-kind display yet — the note-property provider docs/tasks-model.md
// describes is a later phase — so there is nothing today to render its link-and-write-a-property
// behavior against. Its title renders as plain text rather than inventing untested UI for it.
const markdown = computed(() => {
  const display = props.row.item.display;
  return display.kind === "line" ? unwrapLine(display.markdown ?? "") : display.title;
});

// Obsidian renders the row's checkbox itself, inside the markdown, so there is no prop to disable
// it through: a context row's control has to be disabled on the rendered element, or it keeps
// accepting focus and a click for an action that deliberately does nothing. Re-applied after every
// repaint — hydration replaces a row's markdown, and with it the input.
const line = ref<HTMLElement | null>(null);
function disableContextCheckboxes(): void {
  if (!props.row.context) return;
  const checkboxes = line.value?.querySelectorAll<HTMLInputElement>("input[type=checkbox]") ?? [];
  for (const checkbox of checkboxes) checkbox.disabled = true;
}
onMounted(disableContextCheckboxes);
watch(markdown, disableContextCheckboxes, { flush: "post" });

function onLineClick(event: MouseEvent): void {
  const checkbox = checkboxTarget(event);
  if (checkbox === null) return;
  // Obsidian attaches no handler of its own to this checkbox, so its native default (flipping its
  // own `checked` property) has to be suppressed unconditionally — including for a context row,
  // whose whole point is that clicking it does nothing.
  event.preventDefault();
  if (props.row.context) return;
  void tick.toggle(props.row.item).tapErr((error) => {
    // TickService already shows its own notice for a benign refusal (a recurring line with no
    // Tasks plugin to advance it) — a second one here would double up on it.
    if (isBenignFlowError(error)) return;
    notices.show(m.tasks_tick_error());
  });
}

function openSource(event: MouseEvent): void {
  void workspace
    .openNote(props.row.source.path, defineOpenMode(event))
    .tapErr(() => notices.show(m.common_note_open_error()));
}
</script>

<template>
  <li
    class="task-listing-row"
    :data-depth="row.depth"
    :data-context="row.context"
    :style="{ '--task-listing-depth': row.depth }"
  >
    <div ref="line" class="task-listing-row__line" @click="onLineClick">
      <UiMarkdown :markdown="markdown" :source-path="row.item.path" />
    </div>
    <a href="#" class="task-listing-row__source" @click.prevent="openSource" @auxclick.middle.prevent="openSource">{{
      row.source.label
    }}</a>
  </li>
</template>

<style scoped>
/* The block renders inside `.markdown-rendered`, where `ul > li` takes `margin-inline-start: 3ch`
   (app.css, 1.8.7 through 1.13.x) — a gutter for the list marker. That rule reaches the listing's
   own <ul>/<li> too, where the row draws no marker and nesting is carried by
   `--task-listing-depth`, so it is a fixed inset on every row at every depth. Measured in real
   Obsidian: 26.7px on the row, before the rendered line's own indentation. */
.task-listing-row {
  display: flex;
  align-items: baseline;
  gap: var(--size-4-2);
  margin-inline-start: 0;
  padding-inline-start: calc(var(--task-listing-depth, 0) * var(--size-4-3));
}
.task-listing-row[data-context="true"] {
  opacity: 0.6;
}
/* Each row is also its own one-item markdown document, so the same 3ch rule lands on the list
   Obsidian wraps it in. Zero that too, and reserve the gutter here instead: the rendered checkbox
   is pulled back by `--checkbox-size * -1.5`, so that much start padding lands it exactly on the
   row's left edge (measured: a 24px pull against 24px of padding). */
.task-listing-row__line {
  flex: 1;
  min-width: 0;
  padding-inline-start: calc(var(--checkbox-size) * 1.5);
}
.task-listing-row__line :deep(ul),
.task-listing-row__line :deep(ol) {
  margin-block: 0;
  padding-inline-start: 0;
}
.task-listing-row__line :deep(ul > li),
.task-listing-row__line :deep(ol > li) {
  margin-inline-start: 0;
}
.task-listing-row__source {
  flex: none;
  font-size: var(--font-ui-smaller);
  color: var(--text-muted);
}
</style>
