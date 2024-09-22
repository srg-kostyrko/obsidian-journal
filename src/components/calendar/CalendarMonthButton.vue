<script setup lang="ts">
import { useDecorations } from "@/composables/use-decorations";
import type { MomentDate } from "@/types/date.types";
import CalendarDecoration from "./CalendarDecoration.vue";
import { decorationsForMonths$, journalsWithMonths$ } from "@/stores/settings.store";
import ObsidianButton from "../obsidian/ObsidianButton.vue";
import { toRefs } from "vue";

const props = defineProps<{
  date: MomentDate;
}>();
const { date } = toRefs(props);
const emit = defineEmits<(e: "select", event: MouseEvent, date: MomentDate) => void>();

const decorationsStyles = useDecorations(date, decorationsForMonths$);
function select(event: MouseEvent) {
  if (!journalsWithMonths$.value.length) {
    return;
  }
  emit("select", event, props.date);
}
</script>

<template>
  <ObsidianButton class="month-button" flat :disabled="!journalsWithMonths$.length" @click="select">
    <CalendarDecoration :styles="decorationsStyles">{{ date.format("MMMM") }}</CalendarDecoration>
  </ObsidianButton>
</template>

<style scoped>
.month-button {
  background-color: transparent;
  box-shadow: none;
  position: relative;
}
.month-button:disabled {
  opacity: 1;
  cursor: auto;
}
</style>
