<script setup lang="ts">
import { computed } from "vue";

import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { isBenignFlowError } from "@/infrastructure/flows";
import { defineOpenMode, NoticeService, WorkspaceService } from "@/infrastructure/host";
import UiMarkdown from "@/ui/UiMarkdown.vue";

import { TickService } from "../tick";

import { checkboxTarget } from "./task-row-click";

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
  return display.kind === "line" ? (display.markdown ?? "") : display.title;
});

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
    <div class="task-listing-row__line" @click="onLineClick">
      <UiMarkdown :markdown="markdown" :source-path="row.item.path" />
    </div>
    <a href="#" class="task-listing-row__source" @click.prevent="openSource" @auxclick.middle.prevent="openSource">{{
      row.source.label
    }}</a>
  </li>
</template>

<style scoped>
.task-listing-row {
  display: flex;
  flex-direction: column;
  gap: var(--size-4-1);
  padding-inline-start: calc(var(--task-listing-depth, 0) * var(--size-4-3));
}
.task-listing-row[data-context="true"] {
  opacity: 0.6;
}
.task-listing-row__source {
  align-self: flex-start;
  font-size: var(--font-ui-smaller);
  color: var(--text-muted);
}
</style>
