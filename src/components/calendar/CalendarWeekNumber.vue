<script setup lang="ts">
import type { MomentDate } from "../../types/date.types";
defineProps<{
  date: MomentDate;
}>();
</script>

<template>
  <button>
    {{ date.format("[W]W") }}
  </button>
</template>

<style scoped>
button {
  background-color: transparent;
  box-shadow: none;
}
</style>
