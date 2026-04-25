<script setup lang="ts">
import { Notice } from "obsidian";
import { computed } from "vue";

const props = defineProps<{
  name: string;
}>();

const variable = computed(() => `{{${props.name}}}`);

async function copy(event: Event) {
  const content = (event.target as HTMLElement).textContent;
  if (!content) return;
  try {
    await navigator.clipboard.writeText(content);
    new Notice("Copied to clipboard");
  } catch (error) {
    console.error(error);
  }
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
