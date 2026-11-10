<script setup lang="ts">
import { Notice } from "obsidian";

import { m } from "@/i18n";

const { text } = defineProps<{ text: string }>();

function copy(): void {
  void navigator.clipboard.writeText(text).then(() => {
    new Notice(m.common_copied_to_clipboard());
  });
}
</script>

<template>
  <pre class="copyable-code" role="button" tabindex="0" @click="copy()" @keydown.enter="copy()">{{ text }}</pre>
</template>

<style scoped>
.copyable-code {
  border: var(--modal-border-width) solid var(--modal-border-color);
  border-radius: var(--radius-s);
  cursor: pointer;
  padding: var(--size-2-2);
  font-family: var(--font-monospace);
  white-space: pre;
}
.copyable-code:hover {
  border-color: var(--interactive-accent);
}
</style>
