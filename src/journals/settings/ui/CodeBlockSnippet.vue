<script setup lang="ts">
import { Notice } from "obsidian";
import { computed } from "vue";

import { m } from "@/i18n";

const props = defineProps<{ name: string; body?: string }>();

const text = computed(() =>
  props.body ? `\`\`\`${props.name}\n${props.body}\n\`\`\`` : `\`\`\`${props.name}\n\`\`\``,
);

function copy(): void {
  void navigator.clipboard.writeText(text.value).then(() => {
    new Notice(m.journal_edit_code_block_copied());
  });
}
</script>

<template>
  <pre class="code-block-snippet" role="button" tabindex="0" @click="copy()" @keydown.enter="copy()">{{ text }}</pre>
</template>

<style scoped>
.code-block-snippet {
  border: var(--modal-border-width) solid var(--modal-border-color);
  border-radius: var(--radius-s);
  cursor: pointer;
  padding: var(--size-2-2);
  font-family: var(--font-monospace);
  white-space: pre;
}
.code-block-snippet:hover {
  border-color: var(--interactive-accent);
}
</style>
