<script setup lang="ts">
import { computed } from "vue";
import NavigationBlockRow from "./NavigationBlockRow.vue";
import { openDate, openDateInJournal } from "@/journals/open-date";
import { useShelfProvider } from "@/composables/use-shelf";
import type { NavBlockRow } from "@/types/settings.types";
import { usePlugin } from "@/composables/use-plugin";
import { useDecorations } from "@/composables/use-decorations";
import CalendarDecoration from "@/components/notes-calendar/decorations/CalendarDecoration.vue";
import { defineOpenMode } from "@/utils/journals";
import type { JournalNoteData } from "@/types/journal.types";
import { Menu } from "obsidian";

const { refDate, journalName, preventNavigation } = defineProps<{
  refDate: string;
  journalName: string;
  rows: NavBlockRow[];
  preventNavigation?: boolean;
  decorateBlock?: boolean;
}>();

defineEmits<(event: "move-up" | "move-down" | "edit" | "remove", index: number) => void>();

const plugin = usePlugin();

const journal = computed(() => plugin.getJournal(journalName));
const shelfName = computed(() => journal.value?.shelfName ?? null);

const { journals, decorations } = useShelfProvider(shelfName);
const decorationsList = computed(() => {
  return journal.value
    ? decorations[journal.value.type].value.filter((decoration) => decoration.journalName === journalName)
    : [];
});
const decorationsStyles = useDecorations(plugin, refDate, decorationsList);

async function navigate(type: NavBlockRow["link"], date: string, event: MouseEvent, journalName?: string) {
  if (preventNavigation) return;
  if (type === "none") return;
  if (type === "self") {
    const metadata = journal.value?.get(refDate);
    if (metadata) await journal.value?.open(metadata);
  } else if (type === "journal") {
    if (!journalName) return;
    await openDateInJournal(plugin, date, journalName);
  } else {
    const journalsToUse = journals[type].value.map((journal) => journal.name);
    await openDate(plugin, date, journalsToUse, false, event && defineOpenMode(event), event);
  }
}

function openContextMenu(type: NavBlockRow["link"], date: string, event: MouseEvent, journalName?: string) {
  if (preventNavigation) return;
  if (type === "none") return;
  if (type === "self") {
    const metadata = journal.value?.get(refDate);
    if (metadata && "path" in metadata) plugin.appManager.showContextMenu(metadata.path, event);
  } else if (type === "journal") {
    if (!journalName) return;
    const journal = plugin.getJournal(journalName);
    if (!journal) return;
    const metadata = journal.get(date);
    if (metadata && "path" in metadata) plugin.appManager.showContextMenu(metadata.path, event);
  } else {
    const list = journals[type].value
      .map((journal) => journal.get(date))
      .filter((metadata): metadata is JournalNoteData => {
        return !!metadata && "path" in metadata;
      });
    if (list.length === 0) return;
    if (list.length === 1) {
      if (!list[0]) return;
      plugin.appManager.showContextMenu(list[0].path, event);
    } else {
      const menu = new Menu();
      for (const note of list) {
        menu.addItem((item) => {
          item.setTitle(note.path).onClick(() => {
            plugin.appManager.showContextMenu(note.path, event);
          });
        });
      }
      menu.showAtMouseEvent(event);
    }
  }
}

function openPreview(type: NavBlockRow["link"], date: string, event: MouseEvent, journalName?: string) {
  if (preventNavigation) return;
  if (type === "none") return;
  if (type === "self") {
    const metadata = journal.value?.get(refDate);
    if (metadata && "path" in metadata) plugin.appManager.showPreview(metadata.path, event);
  } else if (type === "journal") {
    if (!journalName) return;
    const journal = plugin.getJournal(journalName);
    if (!journal) return;
    const metadata = journal.get(date);
    if (metadata && "path" in metadata) plugin.appManager.showPreview(metadata.path, event);
  } else {
    const metadata = journals[type].value
      .map((journal) => journal.get(date))
      .find((metadata): metadata is JournalNoteData => {
        return !!metadata && "path" in metadata;
      });
    if (!metadata) return;
    plugin.appManager.showPreview(metadata.path, event);
  }
}
</script>

<template>
  <div v-if="journal" class="nav-block">
    <CalendarDecoration v-if="decorateBlock" :styles="decorationsStyles" class="nav-block">
      <div v-for="(row, index) of rows" :key="index">
        <NavigationBlockRow
          :journal="journal"
          :row="row"
          :ref-date="refDate"
          :default-format="journal.dateFormat"
          @navigate="navigate"
          @contextmenu="openContextMenu"
          @preview="openPreview"
        />
      </div>
    </CalendarDecoration>
    <template v-else>
      <div v-for="(row, index) of rows" :key="index">
        <NavigationBlockRow
          :journal="journal"
          :row="row"
          :ref-date="refDate"
          :default-format="journal.dateFormat"
          @navigate="navigate"
          @contextmenu="openContextMenu"
          @preview="openPreview"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.nav-block {
  display: flex;
  flex-direction: column;
  text-align: center;
}
</style>
