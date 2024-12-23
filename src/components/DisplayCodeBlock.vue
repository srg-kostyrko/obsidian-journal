<script setup lang="ts">
import { Notice } from "obsidian";

defineProps<{
  name: string;
}>();

async function copy(event: MouseEvent) {
  // eslint-disable-next-line unicorn/prefer-dom-node-text-content -- textContent does not keep line breaks
  const content = (event.target as HTMLElement).innerText;
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
  <div class="code-block-sample" @click="copy">
    ```{{ name }}<br /><template v-if="$slots.default"><slot /><br /></template>```
  </div>
</template>

<style scoped>
.code-block-sample {
  border: var(--modal-border-width) solid var(--modal-border-color);
  border-radius: var(--radius-s);
  cursor: pointer;
  padding: var(--size-2-2);
  font-family: monospace;
}
</style>
