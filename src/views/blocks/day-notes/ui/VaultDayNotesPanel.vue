<script setup lang="ts">
import { Menu } from "obsidian";
import { computed } from "vue";

import {
  vaultDayNotesSortDirection,
  vaultDayNotesSortField,
  withVaultDayNotesSortDirection,
  withVaultDayNotesSortField,
  type VaultDayNotesSort,
  type VaultDayNotesSortField,
} from "@/calendar/settings/display-slice";
import { m } from "@/i18n";
import { useService } from "@/infrastructure/di";
import { NoticeService, WorkspaceService, type Note } from "@/infrastructure/host";
import { icons } from "@/ui/icons";
import UiIcon from "@/ui/UiIcon.vue";
import UiIconButton from "@/ui/UiIconButton.vue";
import { vTooltip } from "@/ui/v-tooltip";

import type { VaultDayNote } from "../use-vault-day-notes";

defineProps<{
  notes: readonly VaultDayNote[];
}>();
const sort = defineModel<VaultDayNotesSort>("sort", { required: true });
const includeJournals = defineModel<boolean>("includeJournals", { required: true });
const emit = defineEmits<{ close: []; previous: []; next: [] }>();

const workspace = useService(WorkspaceService);
const notices = useService(NoticeService);
const modifiedFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const sortField = computed(() => vaultDayNotesSortField(sort.value));
const sortDirection = computed(() => vaultDayNotesSortDirection(sort.value));
const sortDirectionIcon = computed(() =>
  sortDirection.value === "asc" ? icons.action.sortAscending : icons.action.sortDescending,
);
const sortDirectionTooltip = computed(() =>
  sortDirection.value === "asc" ? m.calendar_noteview_sort_ascending() : m.calendar_noteview_sort_descending(),
);

function compactTitle(title: string): string {
  return title.length > 80 ? `${title.slice(0, 79)}…` : title;
}

function modifiedLabel(note: Note): string {
  return m.calendar_noteview_last_modified({ date: modifiedFormat.format(new Date(note.mtime)) });
}

function open(note: Note): void {
  workspace.openNote(note.path, "tab").tapErr(() => notices.show(m.common_note_open_error()));
}

function setSortField(field: VaultDayNotesSortField): void {
  sort.value = withVaultDayNotesSortField(sort.value, field);
}

function openSortMenu(event: MouseEvent): void {
  const menu = new Menu();
  menu.addItem((item) =>
    item
      .setTitle(m.calendar_noteview_sort_modified())
      .setIcon(sortField.value === "modified" ? icons.action.check : "clock")
      .onClick(() => setSortField("modified")),
  );
  menu.addItem((item) =>
    item
      .setTitle(m.calendar_noteview_sort_name())
      .setIcon(sortField.value === "name" ? icons.action.check : "text")
      .onClick(() => setSortField("name")),
  );
  menu.showAtMouseEvent(event);
}

function toggleSortDirection(): void {
  sort.value = withVaultDayNotesSortDirection(sort.value, sortDirection.value === "asc" ? "desc" : "asc");
}
</script>

<template>
  <section class="vault-day-notes">
    <header class="vault-day-notes__toolbar">
      <div class="vault-day-notes__sort-actions">
        <UiIconButton
          :icon="icons.action.sort"
          :tooltip="m.calendar_noteview_sort_label()"
          aria-haspopup="menu"
          @click="openSortMenu"
        />
        <UiIconButton :icon="sortDirectionIcon" :tooltip="sortDirectionTooltip" @click="toggleSortDirection" />
        <UiIconButton
          :icon="icons.entity.journal"
          :tooltip="m.calendar_noteview_include_journals_label()"
          :aria-pressed="includeJournals"
          :class="{ 'is-active': includeJournals }"
          @click="includeJournals = !includeJournals"
        />
        <UiIconButton :icon="icons.nav.prev" :tooltip="m.calendar_noteview_previous_day()" @click="emit('previous')" />
        <UiIconButton :icon="icons.nav.next" :tooltip="m.calendar_noteview_next_day()" @click="emit('next')" />
      </div>
      <UiIconButton :icon="icons.action.close" :tooltip="m.calendar_noteview_close()" @click="emit('close')" />
    </header>
    <div class="vault-day-notes__cards">
      <button
        v-for="note in notes"
        :key="note.path"
        type="button"
        class="vault-day-notes__card"
        :title="note.basename"
        @click="open(note)"
      >
        <span v-if="note.journalName" class="vault-day-notes__badges">
          <span
            v-if="note.shelfName"
            v-tooltip="note.shelfName"
            class="vault-day-notes__badge vault-day-notes__badge--shelf"
            :aria-label="note.shelfName"
          >
            <UiIcon :name="icons.entity.shelf" aria-hidden="true" />
          </span>
          <span
            v-tooltip="note.journalName"
            class="vault-day-notes__badge vault-day-notes__badge--journal"
            :aria-label="note.journalName"
          >
            <UiIcon :name="icons.entity.journal" aria-hidden="true" />
          </span>
        </span>
        <span class="vault-day-notes__title" :class="{ 'vault-day-notes__title--with-badges': note.journalName }">
          {{ compactTitle(note.basename) }}
        </span>
        <span class="vault-day-notes__subtitle">{{ modifiedLabel(note) }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.vault-day-notes {
  display: flex;
  min-height: 0;
  flex: 1 1 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-s);
  background: var(--background-primary);
}
.vault-day-notes__toolbar {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-2-2);
  padding: var(--size-2-2);
  border-bottom: 1px solid var(--background-modifier-border);
}
.vault-day-notes__sort-actions {
  display: flex;
  align-items: center;
  gap: var(--size-2-1);
}
.vault-day-notes__cards {
  display: flex;
  min-height: 0;
  flex: 1 1 0;
  flex-direction: column;
  gap: var(--size-2-2);
  overflow-y: auto;
  padding: var(--size-2-2);
}
.vault-day-notes__card {
  position: relative;
  display: flex;
  box-sizing: border-box;
  width: 100%;
  height: 60px;
  min-height: 60px;
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
  text-align: left !important;
  box-shadow: none;
}
.vault-day-notes__card:hover {
  background: var(--background-modifier-hover);
}
.vault-day-notes__title,
.vault-day-notes__subtitle {
  display: block;
  width: 100%;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vault-day-notes__title {
  font-weight: var(--font-semibold);
}
.vault-day-notes__title--with-badges {
  box-sizing: border-box;
  padding-right: calc(var(--size-4-2) + 44px);
}
.vault-day-notes__subtitle {
  color: var(--text-muted);
  font-size: var(--font-ui-smaller);
}
.vault-day-notes__badges {
  position: absolute;
  top: var(--size-2-2);
  right: var(--size-2-2);
  display: flex;
  align-items: center;
  gap: var(--size-2-1);
}
.vault-day-notes__badge {
  display: inline-flex;
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-s);
  background: var(--background-primary-alt);
  color: var(--text-muted);
}
.vault-day-notes__badge :deep(svg) {
  width: 12px;
  height: 12px;
}
</style>
