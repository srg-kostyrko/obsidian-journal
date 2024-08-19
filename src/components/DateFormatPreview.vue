<script setup lang="ts">
import { computed } from "vue";
import { today } from "../calendar";

const props = defineProps<{
  format: string;
}>();

const formattedDate = computed(() => {
  return today().format(props.format);
});
</script>

<template>
  Your current syntax looks like this: <b class="u-pop">{{ formattedDate }}</b>
</template>
