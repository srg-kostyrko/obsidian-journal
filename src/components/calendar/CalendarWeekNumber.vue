<script setup lang="ts">
import { useDecorations } from "@/composables/use-decorations";
import type { MomentDate } from "@/types/date.types";
import CalendarDecoration from "./CalendarDecoration.vue";
import { decorationsForWeeks$ } from "@/stores/settings.store";
import { toRefs } from "vue";
const props = defineProps<{
  date: MomentDate;
}>();

const { date } = toRefs(props);
const decorationsStyles = useDecorations(date, decorationsForWeeks$);
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
