<script setup lang="ts">
import { Notice } from "obsidian";

import { m } from "@/i18n";

const props = defineProps<{ name: string }>();
const token = `{{${props.name}}}`;

function copy(): void {
  void navigator.clipboard.writeText(token).then(() => {
    new Notice(m.variable_chip_copied());
  });
}
</script>

<template>
  <code class="variable-chip" role="button" tabindex="0" @click="copy()" @keydown.enter="copy()">
    {{ token }}
  </code>
</template>

<style scoped>
.variable-chip {
  cursor: pointer;
  user-select: none;
}
.variable-chip:hover {
  text-decoration: underline dotted;
}
</style>
