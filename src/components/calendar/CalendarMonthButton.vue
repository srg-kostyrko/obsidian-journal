<script setup lang="ts">
import { useDecorations } from "@/composables/use-decorations";
import type { MomentDate } from "@/types/date.types";
import CalendarDecoration from "./CalendarDecoration.vue";
import ObsidianButton from "../obsidian/ObsidianButton.vue";
import { inject, toRefs } from "vue";
import { SHELF_DATA_KEY } from "@/constants";

const props = defineProps<{
  date: MomentDate;
}>();
const { date } = toRefs(props);
const emit = defineEmits<(event: "select", nativeEvent: MouseEvent, date: MomentDate) => void>();

const { journals, decorations } = inject(SHELF_DATA_KEY);
const decorationsStyles = useDecorations(date, decorations.month);
function select(event: MouseEvent) {
  if (journals.month.value.length === 0) {
    return;
  }
  emit("select", event, props.date);
}
</script>

<template>
  <ObsidianButton class="month-button" flat :disabled="journals.month.value.length === 0" @click="select">
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
