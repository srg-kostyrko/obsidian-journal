<script setup lang="ts">
import { computed, ref, watch } from "vue";
import ObsidianIconButton from "../components/obsidian/ObsidianIconButton.vue";
import ObsidianButton from "../components/obsidian/ObsidianButton.vue";
import DatePickerModal from "../components/modals/DatePicker.modal.vue";
import { VueModal } from "../components/modals/vue-modal";
import { today, date_from_string } from "../calendar";
import { openDate } from "@/journals/open-date";
import { useShelfProvider } from "@/composables/use-shelf";
import { usePlugin } from "@/composables/use-plugin";
import NotesMonthView from "@/components/notes-calendar/NotesMonthView.vue";
import NotesCalendarButton from "@/components/notes-calendar/NotesCalendarButton.vue";
import CalendarViewCustomIntervals from "./CalendarViewCustomIntervals.vue";
import { FRONTMATTER_DATE_FORMAT } from "@/constants";
import { useActiveNoteData } from "@/composables/use-active-note-data";
import { defineOpenMode } from "@/utils/journals";
import { Menu } from "obsidian";

const plugin = usePlugin();

const refDateMoment = ref(today());
const refDate = computed(() => refDateMoment.value.format("YYYY-MM-DD"));

const selectedShelf = computed({
  get() {
    return plugin.uiSettings.calendarShelf;
  },
  set(value) {
    plugin.uiSettings.calendarShelf = value;
  },
});
const shouldShowShelf = computed(() => {
  return (
    (plugin.usesShelves && Object.values(plugin.shelves).length > 0) ||
    plugin.journals.some((journal) => !journal.isOnShelf)
  );
});

const { journals } = useShelfProvider(selectedShelf);

const monthRefDate = computed(() => {
  return refDateMoment.value.clone().startOf("month").format(FRONTMATTER_DATE_FORMAT);
});
const quarterRefDate = computed(() => {
  return refDateMoment.value.clone().startOf("quarter").format(FRONTMATTER_DATE_FORMAT);
});
const yearRefDate = computed(() => {
  return refDateMoment.value.clone().startOf("year").format(FRONTMATTER_DATE_FORMAT);
});

const activeNoteData = useActiveNoteData(plugin);
const activeNoteJournal = computed(() => {
  if (!activeNoteData.value) return null;
  return plugin.getJournal(activeNoteData.value.journal);
});
const isMonthActive = computed(
  () => activeNoteJournal.value?.type === "month" && activeNoteData.value?.date === monthRefDate.value,
);
const isQuarterActive = computed(
  () => activeNoteJournal.value?.type === "quarter" && activeNoteData.value?.date === quarterRefDate.value,
);
const isYearActive = computed(
  () => activeNoteJournal.value?.type === "year" && activeNoteData.value?.date === yearRefDate.value,
);

function selectShelf(event: MouseEvent) {
  const menu = new Menu();
  menu.addItem((item) => {
    item.setTitle("All journals").onClick(() => {
      selectedShelf.value = null;
    });
  });
  for (const shelf of plugin.shelves) {
    menu.addItem((item) => {
      item.setTitle(shelf.name).onClick(() => {
        selectedShelf.value = shelf.name;
      });
    });
  }
  menu.showAtMouseEvent(event);
}

function navigate(amount: number, step: "month" | "year" = "month") {
  const newDate = refDateMoment.value.clone();
  if (amount < 0) {
    newDate.subtract(Math.abs(amount), step);
  } else {
    newDate.add(amount, step);
  }
  refDateMoment.value = newDate;
}
function goToday(event: MouseEvent) {
  refDateMoment.value = today();
  if (plugin.calendarViewSettings.todayMode === "create") {
    openDay(refDate.value, event);
  } else if (plugin.calendarViewSettings.todayMode === "navigate") {
    const journals: string[] = [];
    for (const journal of plugin.journals) {
      const anchorDate = journal.resolveAnchorDate(refDate.value);
      if (!anchorDate) continue;
      const index = plugin.index.getJournalIndex(journal.name);
      if (!index) continue;
      if (index.get(anchorDate)) journals.push(journal.name);
    }
    openDate(plugin, refDate.value, journals, defineOpenMode(event), event).catch(console.error);
  }
}
function pickDate(event: MouseEvent) {
  new VueModal(
    plugin,
    "Pick a date",
    DatePickerModal,
    {
      selectedDate: refDate.value,
      onSelect(date: string) {
        refDateMoment.value = date_from_string(date);
        if (plugin.calendarViewSettings.pickMode === "create") {
          openDay(date, event);
        } else if (plugin.calendarViewSettings.pickMode === "navigate") {
          const journals: string[] = [];
          for (const journal of plugin.journals) {
            const anchorDate = journal.resolveAnchorDate(date);
            if (!anchorDate) continue;
            const index = plugin.index.getJournalIndex(journal.name);
            if (!index) continue;
            if (index.get(anchorDate)) journals.push(journal.name);
          }
          openDate(plugin, date, journals, event.metaKey ? "tab" : "active", event).catch(console.error);
        }
      },
    },
    400,
  ).open();
}

function openDay(date: string, event: MouseEvent) {
  openDate(
    plugin,
    date,
    journals.day.value.map((journal) => journal.name),
    event.metaKey ? "tab" : "active",
    event,
  ).catch(console.error);
}

watch(activeNoteData, (activeNote) => {
  if (!activeNote) return;
  const journal = plugin.getJournal(activeNote.journal);
  if (!journal) return;
  switch (journal.type) {
    case "quarter": {
      const start = date_from_string(activeNote.date).startOf("quarter");
      const end = date_from_string(activeNote.date).endOf("quarter");
      if (!refDateMoment.value.isBetween(start, end)) {
        refDateMoment.value = start;
      }
      break;
    }
    case "year": {
      const start = date_from_string(activeNote.date).startOf("year");
      const end = date_from_string(activeNote.date).endOf("year");
      if (!refDateMoment.value.isBetween(start, end)) {
        refDateMoment.value = start;
      }
      break;
    }
    default: {
      refDateMoment.value = date_from_string(activeNote.date);
    }
  }
});
// TODO slim header to avoid scroll
</script>

<template>
  <div>
    <div class="calendar-view-header">
      <ObsidianButton v-if="shouldShowShelf" @click="selectShelf">
        {{ selectedShelf || "All journals" }}
      </ObsidianButton>
      <ObsidianIconButton icon="crosshair" tooltip="Select a date to be displayed" @click="pickDate" />
      <ObsidianButton @click="goToday">Today</ObsidianButton>
    </div>
    <NotesMonthView :ref-date="refDate">
      <template #header>
        <ObsidianIconButton icon="chevrons-left" tooltip="Previous year" @click="navigate(-1, 'year')" />
        <ObsidianIconButton icon="chevron-left" tooltip="Previous month" @click="navigate(-1, 'month')" />
        <div class="month-header">
          <NotesCalendarButton :date="monthRefDate" type="month" :data-selected="isMonthActive ? '' : null" />
          <NotesCalendarButton
            v-if="journals.quarter.value.length > 0"
            :date="quarterRefDate"
            type="quarter"
            :data-selected="isQuarterActive ? '' : null"
          />
          <NotesCalendarButton :date="yearRefDate" type="year" :data-selected="isYearActive ? '' : null" />
        </div>

        <ObsidianIconButton icon="chevron-right" tooltip="Next month" @click="navigate(1, 'month')" />
        <ObsidianIconButton icon="chevrons-right" tooltip="Next year" @click="navigate(1, 'year')" />
      </template>
    </NotesMonthView>

    <div class="calendar-view-separator" />

    <CalendarViewCustomIntervals :date="refDate" />
  </div>
</template>

<style scoped>
.calendar-view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--size-2-2);
}
.month-header {
  flex: 1;
  display: flex;
  gap: var(--size-2-2);
  align-items: center;
  justify-content: center;
}
.calendar-view-separator {
  height: 1px;
  margin: var(--size-2-2) 0;
  border-bottom: 1px solid var(--color-accent);
}
</style>
