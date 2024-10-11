<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  name: string;
}>();

const variable = computed(() => `{{${props.name}}}`);

function copy(event: Event) {
  navigator.clipboard.writeText((event.target as HTMLElement).textContent ?? "").catch(console.error);
}
</script>

<template>
  <span class="variable" @click="copy">{{ variable }}</span>
</template>

<style scoped>
.variable {
  border: var(--modal-border-width) solid var(--modal-border-color);
  border-radius: var(--radius-s);
  cursor: pointer;
  padding: 2px 4px;
  font-family: monospace;
}
.variable:hover {
  background-color: var(--background-secondary);
}
</style>
