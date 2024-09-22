<script setup lang="ts">
import { useDecorations } from "@/composables/use-decorations";
import type { MomentDate } from "@/types/date.types";
import CalendarDecoration from "./CalendarDecoration.vue";
import { journalsWithQuarters$ } from "@/stores/settings.store";
import ObsidianButton from "../obsidian/ObsidianButton.vue";
import { toRefs } from "vue";

const props = defineProps<{
  date: MomentDate;
}>();
const { date } = toRefs(props);
const emit = defineEmits<(e: "select", event: MouseEvent, date: MomentDate) => void>();

const decorationsStyles = useDecorations(date, journalsWithQuarters$);
function select(event: MouseEvent) {
  if (!journalsWithQuarters$.value.length) {
    return;
  }
  emit("select", event, props.date);
}
</script>

<template>
  <ObsidianButton class="quarter-button" flat :disabled="!journalsWithQuarters$.length" @click="select">
    <CalendarDecoration :styles="decorationsStyles">{{ date.format("[Q]Q") }}</CalendarDecoration>
  </ObsidianButton>
</template>

<style scoped>
.quarter-button {
  background-color: transparent;
  box-shadow: none;
  position: relative;
}
.quarter-button:disabled {
  opacity: 1;
  cursor: auto;
}
</style>
