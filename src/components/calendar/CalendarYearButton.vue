<script setup lang="ts">
import { useDecorations } from "@/composables/use-decorations";
import type { MomentDate } from "@/types/date.types";
import CalendarDecoration from "./CalendarDecoration.vue";
import { decorationsForYears$, journalsWithYears$ } from "@/stores/settings.store";
import ObsidianButton from "../obsidian/ObsidianButton.vue";
import { toRefs } from "vue";

const props = defineProps<{
  date: MomentDate;
}>();
const { date } = toRefs(props);
const emit = defineEmits<(e: "select", event: MouseEvent, date: MomentDate) => void>();

const decorationsStyles = useDecorations(date, decorationsForYears$);
function select(event: MouseEvent) {
  if (!journalsWithYears$.value.length) {
    return;
  }
  emit("select", event, props.date);
}
</script>

<template>
  <ObsidianButton class="year-button" flat :disabled="!journalsWithYears$.length" @click="select">
    <CalendarDecoration :styles="decorationsStyles">{{ date.format("YYYY") }}</CalendarDecoration>
  </ObsidianButton>
</template>

<style scoped>
.year-button {
  background-color: transparent;
  box-shadow: none;
  position: relative;
}
.year-button:disabled {
  opacity: 1;
  cursor: auto;
}
</style>
