<script setup lang="ts">
import { inject, toRefs } from "vue";
import type { MomentDate } from "../../types/date.types";
import { useDecorations } from "@/composables/use-decorations";
import CalendarDecoration from "./CalendarDecoration.vue";
import { SHELF_DATA_KEY } from "@/constants";
const props = defineProps<{
  date: MomentDate;
}>();

const { date } = toRefs(props);
const { decorations } = inject(SHELF_DATA_KEY);
const decorationsStyles = useDecorations(date, decorations.day);
</script>

<template>
  <button>
    <CalendarDecoration :styles="decorationsStyles">
      {{ date.format("D") }}
    </CalendarDecoration>
  </button>
</template>

<style scoped>
button {
  background-color: transparent;
  box-shadow: none;
}
</style>
