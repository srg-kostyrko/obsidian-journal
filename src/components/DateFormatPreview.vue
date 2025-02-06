<script setup lang="ts">
import { computed } from "vue";
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
    <div v-if="hasWrongWeek" class="warn">
      You use `W` to format weeks which does not respect custom week settings. This might show week number different
      from what is displayed in Calendar view.<br />
      It is recommended to use `w` instaed (and change start of week using plugin settings if needed).
    </div>
  </div>
</template>

<style scoped>
.warn {
  color: rgb(var(--callout-warning));
}
</style>
