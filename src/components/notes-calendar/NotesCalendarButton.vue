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

const { date, type } = defineProps<{
  date: string;
  type: JournalSettings["write"]["type"];
}>();

const plugin = usePlugin();
const { journals, decorations } = useShelfData();
const isActionable = computed(() => journals[type].value.length > 0);
const format = computed(() => calendarFormats[type]);
const decorationsStyles = useDecorations(plugin, date, decorations[type]);

function open(event: MouseEvent) {
  if (!isActionable.value) return;
  openDate(
    plugin,
    date,
    journals[type].value.map((journal) => journal.name),
    event,
  ).catch(console.error);
}
</script>

<template>
  <CalendarButton class="calendar-button" :clickable="isActionable" @click="open">
    <CalendarDecoration :styles="decorationsStyles">
      <FormattedDate :date :format />
    </CalendarDecoration>
  </CalendarButton>
</template>

<style scoped>
.calendar-button {
  position: relative;
}
</style>
