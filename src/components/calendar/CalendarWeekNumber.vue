<script setup lang="ts">
import { useDecorations } from "@/composables/use-decorations";
import type { MomentDate } from "@/types/date.types";
import CalendarDecoration from "./CalendarDecoration.vue";
import { inject, toRefs } from "vue";
import { SHELF_DATA_KEY } from "@/constants";
const props = defineProps<{
  date: MomentDate;
}>();

const { date } = toRefs(props);
const { decorations } = inject(SHELF_DATA_KEY);
const decorationsStyles = useDecorations(date, decorations.week);
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
