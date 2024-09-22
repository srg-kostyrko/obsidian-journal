<script setup lang="ts">
import { useDecorations } from "@/composables/use-decorations";
import type { MomentDate } from "@/types/date.types";
import CalendarDecoration from "./CalendarDecoration.vue";
import { journalsWithWeeks$ } from "@/stores/settings.store";
const props = defineProps<{
  date: MomentDate;
}>();

const decorationsStyles = useDecorations(props.date, journalsWithWeeks$);
</script>

<template>
  <button>
    <CalendarDecoration :styles="decorationsStyles">{{ date.format("[W]W") }}</CalendarDecoration>
  </button>
</template>

<style scoped>
button {
  background-color: transparent;
  box-shadow: none;
  position: relative;
}
</style>
