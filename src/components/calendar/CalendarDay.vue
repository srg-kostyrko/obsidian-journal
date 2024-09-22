<script setup lang="ts">
import { toRefs } from "vue";
import type { MomentDate } from "../../types/date.types";
import { useDecorations } from "@/composables/use-decorations";
import CalendarDecoration from "./CalendarDecoration.vue";
import { decorationsForDays$ } from "@/stores/settings.store";
const props = defineProps<{
  date: MomentDate;
}>();

const { date } = toRefs(props);
const decorationsStyles = useDecorations(date, decorationsForDays$);
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
