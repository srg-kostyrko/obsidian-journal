<script setup lang="ts">
import { computed } from "vue";
import WrongWeekWarning from "./WrongWeekWarning.vue";
import { today } from "../calendar";

const props = defineProps<{
  format: string;
}>();

const formattedDate = computed(() => {
  return today().format(props.format);
});
const hasWrongWeek = computed(() => {
  return props.format.replaceAll(/\[.*?\]/gi, "").includes("W");
});
</script>

<template>
  <div>
    Your current syntax looks like this: <b class="u-pop">{{ formattedDate }}</b>
    <WrongWeekWarning v-if="hasWrongWeek" />
  </div>
</template>
