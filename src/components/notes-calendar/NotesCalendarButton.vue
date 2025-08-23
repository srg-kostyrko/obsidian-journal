<script setup lang="ts">
import { computed } from "vue";
import { useDecorations } from "@/composables/use-decorations";
import { useShelfData } from "@/composables/use-shelf";
import FormattedDate from "../calendar/FormattedDate.vue";
import CalendarButton from "../calendar/CalendarButton.vue";
import CalendarDecoration from "./decorations/CalendarDecoration.vue";
import { openDate } from "@/journals/open-date";
import { usePlugin } from "@/composables/use-plugin";
import type { JournalSettings } from "@/types/settings.types";
import { calendarFormats } from "@/constants";
import { Menu } from "obsidian";
import type { JournalNoteData } from "@/types/journal.types";
import { defineOpenMode } from "@/utils/journals";
import { isMetaPressed } from "@/utils/ui";

const { date, type, inactive } = defineProps<{
  date: string;
  type: JournalSettings["write"]["type"];
  inactive?: boolean;
}>();

const plugin = usePlugin();
const { journals, decorations } = useShelfData();
const isActionable = computed(() => !inactive && journals[type].value.length > 0);
const format = computed(() => calendarFormats[type]);
const _date = computed(() => date);
const decorationsStyles = useDecorations(plugin, _date, decorations[type]);

function open(event: MouseEvent) {
  if (!isActionable.value) return;
  openDate(
    plugin,
    date,
    journals[type].value.map((journal) => journal.name),
    false,
    defineOpenMode(event),
    event,
  ).catch(console.error);
}

function openContextMenu(event: MouseEvent) {
  const notes: JournalNoteData[] = [];
  for (const journal of journals[type].value) {
    const data = journal.get(date);
    if (data && "path" in data) {
      notes.push(data);
    }
  }
  if (notes.length === 0) return;
  if (notes.length === 1) {
    const [note] = notes;
    if (!note) return;
    plugin.appManager.showContextMenu(note.path, event);
  } else {
    const menu = new Menu();
    for (const note of notes) {
      menu.addItem((item) => {
        item.setTitle(note.path).onClick(() => {
          plugin.appManager.showContextMenu(note.path, event);
        });
      });
    }
    menu.showAtMouseEvent(event);
  }
}

function openPreview(event: PointerEvent) {
  if (!isMetaPressed(event)) return;
  if (!isActionable.value) return;
  const notes: JournalNoteData[] = [];
  for (const journal of journals[type].value) {
    const data = journal.get(date);
    if (data && "path" in data) {
      notes.push(data);
    }
  }
  const [note] = notes;
  if (!note) return;
  plugin.appManager.showPreview(note.path, event);
}
</script>

<template>
  <CalendarButton
    class="calendar-button"
    :clickable="isActionable"
    @click="open"
    @contextmenu="openContextMenu"
    @pointerenter="openPreview"
  >
    <CalendarDecoration v-if="!inactive" :styles="decorationsStyles">
      <FormattedDate :date :format />
    </CalendarDecoration>
  </CalendarButton>
</template>

<style scoped>
.calendar-button {
  position: relative;
  font-size: 1em;
}
</style>
