<script setup lang="ts">
import { onUnmounted, ref } from "vue";

import { m } from "@/i18n";

const props = defineProps<{ name: string }>();
const token = `{{${props.name}}}`;

const copied = ref(false);
let copiedTimer: ReturnType<typeof window.setTimeout> | null = null;

function copy(): void {
  void navigator.clipboard.writeText(token).then(() => {
    copied.value = true;
    if (copiedTimer !== null) window.clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => {
      copied.value = false;
      copiedTimer = null;
    }, 1500);
  });
}

onUnmounted(() => {
  if (copiedTimer !== null) window.clearTimeout(copiedTimer);
});
</script>

<template>
  <code class="variable-chip" role="button" tabindex="0" @click="copy()" @keydown.enter="copy()">
    {{ token }}
    <span v-if="copied" class="variable-chip__copied">{{ m.variable_chip_copied() }}</span>
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
.variable-chip__copied {
  margin-left: 0.5em;
  font-size: 0.85em;
  opacity: 0.7;
}
</style>
