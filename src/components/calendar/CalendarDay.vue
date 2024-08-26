<script setup lang="ts">
import type { MomentDate } from "../../types/date.types";
defineProps<{
  date: MomentDate;
}>();
</script>

<template>
  <button>
    {{ date.format("D") }}
  </button>
</template>

<style scoped>
button {
  cursor: pointer;
  background-color: transparent;
  box-shadow: none;
}
</style>
