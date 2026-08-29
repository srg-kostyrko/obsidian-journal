<script setup lang="ts">
import { Menu } from "obsidian";
import { computed } from "vue";

import { CalendarDate, periodKinds, periodOfKind, type Period } from "@/calendar";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { defineOpenMode, NoticeService, WorkspaceService, type Note } from "@/infrastructure/host";
import { JournalsIndex } from "@/journals";
import { accessibleFormatPattern } from "@/notes-calendar/cell-format";
import { ShelvesService } from "@/shelves";
import { icons } from "@/ui/icons";
import UiIcon from "@/ui/UiIcon.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import { vTooltip } from "@/ui/v-tooltip";

import { ViewsService } from "../../../service";
import { buttonConfigFor, type ButtonAction, type ButtonConfig } from "../../../toolbar-items/button/button-config";
import ButtonItem from "../../../toolbar-items/button/ui/ButtonItem.vue";
import { useViewContext } from "../../../view-context";
import { useDayNotesQuery, type CreatedNote } from "../day-notes";
import { useDayNotesVersion } from "../use-day-notes-version";

import type { BlockInstanceId } from "../../../config";
import type { DayNotesBlockConfig } from "../day-notes-block";

interface DayNoteCard extends CreatedNote {
  readonly journalName: string | null;
  readonly shelfName: string | null;
}

const props = defineProps<{
  instanceId: BlockInstanceId;
  config: DayNotesBlockConfig;
}>();

const viewContext = useViewContext();
const query = useDayNotesQuery();
const queryVersion = useDayNotesVersion();
const index = useService(JournalsIndex);
const shelves = useService(ShelvesService);
const views = useService(ViewsService);
const workspace = useService(WorkspaceService);
const notices = useService(NoticeService);
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const modifiedFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

const period = computed(() =>
  periodOfKind(props.config.granularity, CalendarDate.fromAnchor(viewContext.refDate.value)),
);

function headingOf(value: Period): string {
  if (value.kind === "decade") return `${value.start.format("YYYY")}–${value.end.format("YYYY")}`;
  return value.format(accessibleFormatPattern(value.kind));
}

const heading = computed(() => headingOf(period.value));

function navigationConfig(direction: "prev" | "next"): ButtonConfig {
  const granularity = props.config.granularity;
  const action: ButtonAction = {
    type: "navigate-step",
    direction,
    unit: granularity === "decade" ? "year" : granularity,
    amount: granularity === "decade" ? 10 : 1,
  };
  return {
    ...buttonConfigFor(action),
    tooltip:
      direction === "prev"
        ? m.view_toolbar_button_default_tooltip_prev_unit({ unit: granularity })
        : m.view_toolbar_button_default_tooltip_next_unit({ unit: granularity }),
  };
}

const previousNavigationConfig = computed(() => navigationConfig("prev"));
const nextNavigationConfig = computed(() => navigationConfig("next"));

const cards = computed<readonly DayNoteCard[]>(() => {
  void queryVersion.value;

  const result = query.notesCreatedIn(period.value).map((createdNote): DayNoteCard => {
    const entry = index.entryByPath(createdNote.note.path).getOrUndefined();
    const journalName = entry?.journalName ?? null;
    const shelfName = journalName ? shelves.shelfOf(journalName) || null : null;
    return { ...createdNote, journalName, shelfName };
  });

  return result.toSorted((left, right) => compareCards(left, right, props.config));
});

function compareField(left: DayNoteCard, right: DayNoteCard, field: DayNotesBlockConfig["sortField"]): number {
  switch (field) {
    case "name": {
      return collator.compare(left.note.basename, right.note.basename);
    }
    case "modified": {
      return left.note.mtime - right.note.mtime;
    }
    case "created": {
      return left.created.compareTo(right.created);
    }
  }
}

function compareCards(left: DayNoteCard, right: DayNoteCard, config: DayNotesBlockConfig): number {
  const comparison = compareField(left, right, config.sortField);
  if (comparison !== 0) return config.sortDirection === "asc" ? comparison : -comparison;

  const byName = collator.compare(left.note.basename, right.note.basename);
  if (byName === 0) return collator.compare(left.note.path, right.note.path);
  return byName;
}

function persist(patch: Partial<DayNotesBlockConfig>): void {
  const next = { ...props.config, ...patch };
  void views
    .updateBlockConfig(viewContext.viewId, props.instanceId, next)
    .tapErr(() => notices.show(m.view_block_day_notes_update_error()));
}

function openGranularityMenu(event: MouseEvent): void {
  const menu = new Menu();
  for (const kind of periodKinds) {
    menu.addItem((item) =>
      item
        .setTitle(m.view_block_day_notes_granularity_option({ kind }))
        .setIcon(icons.action.calendar)
        .setChecked(kind === props.config.granularity)
        .onClick(() => persist({ granularity: kind })),
    );
  }
  menu.showAtMouseEvent(event);
}

function openSortMenu(event: MouseEvent): void {
  const fields: readonly { field: DayNotesBlockConfig["sortField"]; label: string; icon: string }[] = [
    { field: "name", label: m.view_block_day_notes_sort_name(), icon: icons.action.sortByName },
    { field: "modified", label: m.view_block_day_notes_sort_modified(), icon: icons.action.sortByModified },
    { field: "created", label: m.view_block_day_notes_sort_created(), icon: icons.action.sortByCreated },
  ];
  const menu = new Menu();
  for (const { field, label, icon } of fields) {
    menu.addItem((item) =>
      item
        .setTitle(label)
        .setIcon(icon)
        .setChecked(field === props.config.sortField)
        .onClick(() => persist({ sortField: field })),
    );
  }
  menu.showAtMouseEvent(event);
}

function toggleSortDirection(): void {
  persist({ sortDirection: props.config.sortDirection === "asc" ? "desc" : "asc" });
}

function open(note: Note, event: MouseEvent | KeyboardEvent): void {
  void workspace.openNote(note.path, defineOpenMode(event)).tapErr(() => notices.show(m.common_note_open_error()));
}

function openOnAuxClick(note: Note, event: MouseEvent): void {
  if (event.button === 1) open(note, event);
}

function modifiedLabel(note: Note): string {
  return m.view_block_day_notes_last_modified({ date: modifiedFormat.format(new Date(note.mtime)) });
}

function createdLabel(note: DayNoteCard): string {
  return m.view_block_day_notes_created({ date: note.created.format("LL") });
}

const sortDirectionIcon = computed(() =>
  props.config.sortDirection === "asc" ? icons.action.sortAscending : icons.action.sortDescending,
);

const sortDirectionLabel = computed(() =>
  props.config.sortDirection === "asc"
    ? m.view_block_day_notes_sort_ascending()
    : m.view_block_day_notes_sort_descending(),
);
</script>

<template>
  <section class="journal-view-day-notes" :aria-label="m.view_block_day_notes_label()">
    <header class="journal-view-day-notes__header">
      <div v-if="config.showHeading || config.showNavigation" class="journal-view-day-notes__period">
        <ButtonItem
          v-if="config.showNavigation"
          class="journal-view-day-notes__navigation"
          :instance-id="instanceId"
          :config="previousNavigationConfig"
        />
        <h3 v-if="config.showHeading" class="journal-view-day-notes__heading">{{ heading }}</h3>
        <ButtonItem
          v-if="config.showNavigation"
          class="journal-view-day-notes__navigation"
          :instance-id="instanceId"
          :config="nextNavigationConfig"
        />
      </div>
      <div class="journal-view-day-notes__toolbar">
        <UiIconButton
          :icon="icons.action.calendar"
          :tooltip="m.view_block_day_notes_granularity_label()"
          aria-haspopup="menu"
          @click="openGranularityMenu"
        />
        <UiIconButton
          :icon="icons.action.sort"
          :tooltip="m.view_block_day_notes_sort_field_label()"
          aria-haspopup="menu"
          @click="openSortMenu"
        />
        <UiIconButton :icon="sortDirectionIcon" :tooltip="sortDirectionLabel" @click="toggleSortDirection" />
      </div>
    </header>

    <div v-if="cards.length === 0" class="journal-view-day-notes__empty">
      {{ m.view_block_day_notes_empty() }}
    </div>
    <div v-else class="journal-view-day-notes__cards">
      <button
        v-for="note in cards"
        :key="note.note.path"
        type="button"
        class="journal-view-day-notes__card"
        :title="note.note.basename"
        @click="open(note.note, $event)"
        @auxclick.middle.prevent="openOnAuxClick(note.note, $event)"
      >
        <span v-if="note.journalName" class="journal-view-day-notes__badges">
          <span
            v-if="note.shelfName"
            v-tooltip="note.shelfName"
            class="journal-view-day-notes__badge"
            :aria-label="note.shelfName"
          >
            <UiIcon :name="icons.entity.shelf" aria-hidden="true" />
          </span>
          <span v-tooltip="note.journalName" class="journal-view-day-notes__badge" :aria-label="note.journalName">
            <UiIcon :name="icons.entity.journal" aria-hidden="true" />
          </span>
        </span>
        <span class="journal-view-day-notes__title" :class="{ 'has-badges': note.journalName }">
          {{ note.note.basename }}
        </span>
        <span class="journal-view-day-notes__metadata journal-view-day-notes__created">
          <template v-if="config.granularity !== 'day'">{{ createdLabel(note) }}</template>
        </span>
        <span class="journal-view-day-notes__metadata">{{ modifiedLabel(note.note) }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.journal-view-day-notes {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
}
.journal-view-day-notes__header {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-2-2);
}
.journal-view-day-notes__heading {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  font-size: var(--font-ui-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.journal-view-day-notes__period {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--size-2-1);
}
.journal-view-day-notes__navigation {
  flex: none;
}
.journal-view-day-notes__toolbar {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--size-2-1);
  margin-inline-start: auto;
}
.journal-view-day-notes__cards {
  display: flex;
  flex-direction: column;
  gap: var(--size-2-2);
}
.journal-view-day-notes__card {
  position: relative;
  display: flex;
  box-sizing: border-box;
  width: 100%;
  height: auto;
  min-height: 84px;
  max-height: none;
  min-width: 0;
  flex: none;
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  gap: var(--size-2-1);
  padding: var(--size-2-2) var(--size-4-2);
  border: 1px solid var(--background-modifier-border);
  border-left: 3px solid var(--interactive-accent);
  border-radius: var(--radius-s);
  background: var(--background-secondary);
  color: var(--text-normal);
  line-height: var(--line-height-tight);
  overflow: visible;
  text-align: left !important;
  box-shadow: none;
}
.journal-view-day-notes__card:hover,
.journal-view-day-notes__card:focus-visible {
  background: var(--background-modifier-hover);
}
.journal-view-day-notes__title,
.journal-view-day-notes__metadata {
  display: block;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.journal-view-day-notes__title {
  margin-block-end: var(--size-2-2);
  font-weight: var(--font-semibold);
}
.journal-view-day-notes__title.has-badges {
  padding-inline-end: 52px;
}
.journal-view-day-notes__metadata {
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
}
.journal-view-day-notes__created {
  min-height: 1em;
}
.journal-view-day-notes__badges {
  position: absolute;
  z-index: 1;
  top: var(--size-2-2);
  right: var(--size-2-2);
  display: flex;
  align-items: center;
  gap: var(--size-2-1);
}
.journal-view-day-notes__badge {
  display: inline-flex;
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-s);
  background: var(--background-primary-alt);
  color: var(--text-normal);
}
.journal-view-day-notes__badge :deep(svg) {
  width: 12px;
  height: 12px;
}
.journal-view-day-notes__empty {
  padding: var(--size-4-3);
  border: 1px dashed var(--background-modifier-border);
  border-radius: var(--radius-s);
  color: var(--text-muted);
  text-align: center;
}
</style>
